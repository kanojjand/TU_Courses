'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { encryptIin, generatePassword, hashIin, isValidIin } from '@/lib/crypto';
import { setSetting } from '@/server/settings';
import { slugify } from '@/lib/utils';
import { reviewCourse } from '@/server/courses';
import { enqueueFinalGrades } from '@/integration/platonus/outbox';

/** Административные действия — F-A-01…F-A-08. */

// ── Пользователи ────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес электронной почты.'),
  lastNameRu: z.string().trim().min(1, 'Укажите фамилию.'),
  firstNameRu: z.string().trim().min(1, 'Укажите имя.'),
  middleNameRu: z.string().trim().optional(),
  iin: z.string().trim().optional(),
  roleCode: z.enum([
    'STUDENT',
    'TEACHER',
    'TUTOR',
    'ADVISOR',
    'METHODIST',
    'REGISTRAR',
    'ADMIN',
    'PROCTOR',
    'GUEST',
  ]),
  uiLanguage: z.enum(['KK', 'RU', 'EN']).default('RU'),
  /** Для роли «Обучающийся» */
  programId: z.string().trim().optional(),
  groupId: z.string().trim().optional(),
  studyYear: z.coerce.number().int().min(1).max(8).default(1),
  /** Для ролей с профилем преподавателя */
  departmentId: z.string().trim().optional(),
  position: z.string().trim().optional(),
  /** Пустое значение — пароль генерируется автоматически */
  password: z.string().trim().optional(),
});

export type CreateUserInput = z.input<typeof createUserSchema>;

export type CreateUserResult =
  | { ok: true; email: string; password: string; generated: boolean }
  | { ok: false; error: string };

/**
 * F-A-03. Создание учётной записи из интерфейса.
 *
 * Раньше пользователей можно было завести только импортом XLSX — для одного
 * человека это неудобно, а на пилоте требуется постоянно.
 *
 * Профиль создаётся сразу: обучающемуся нужна образовательная программа,
 * сотруднику — кафедра. Без них роль остаётся нерабочей: у обучающегося не
 * открывается кабинет, преподавателя нельзя назначить на курс, а эдвайзеру
 * не к кому прикрепить подопечных.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const actor = await requirePermission('user:manage');

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте заполнение полей.' };
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `Пользователь с адресом ${data.email} уже существует.` };
  }

  const iin = data.iin?.replace(/D/g, '') || '';
  if (iin) {
    if (!isValidIin(iin)) {
      return { ok: false, error: 'ИИН должен состоять из 12 цифр и проходить проверку контрольного разряда.' };
    }
    const duplicate = await prisma.user.findFirst({
      where: { iinHash: hashIin(iin) },
      select: { email: true },
    });
    if (duplicate) {
      return { ok: false, error: `Этот ИИН уже закреплён за пользователем ${duplicate.email}.` };
    }
  }

  const needsStudentProfile = data.roleCode === 'STUDENT';
  const needsTeacherProfile = ['TEACHER', 'TUTOR', 'ADVISOR', 'METHODIST'].includes(data.roleCode);

  if (needsStudentProfile && !data.programId) {
    return { ok: false, error: 'Для обучающегося укажите образовательную программу.' };
  }
  if (needsTeacherProfile && !data.departmentId) {
    return { ok: false, error: 'Для этой роли укажите кафедру.' };
  }

  const role = await prisma.role.findUnique({ where: { code: data.roleCode } });
  if (!role) return { ok: false, error: `Роль ${data.roleCode} не найдена в справочнике.` };

  const generated = !data.password;
  const password = data.password || generatePassword();

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: await bcrypt.hash(password, 12),
      // Сгенерированный пароль администратор передаёт лично, поэтому его
      // требуется сменить при первом входе. Заданный вручную — нет.
      mustChangePassword: generated,
      iinEncrypted: iin ? encryptIin(iin) : null,
      iinHash: iin ? hashIin(iin) : null,
      lastNameRu: data.lastNameRu,
      firstNameRu: data.firstNameRu,
      middleNameRu: data.middleNameRu || null,
      lastNameKk: data.lastNameRu,
      firstNameKk: data.firstNameRu,
      lastNameEn: data.lastNameRu,
      firstNameEn: data.firstNameRu,
      uiLanguage: data.uiLanguage,
    },
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id, grantedBy: actor.id },
  });

  if (needsStudentProfile) {
    const group = data.groupId
      ? await prisma.studyGroup.findUnique({
          where: { id: data.groupId },
          select: { id: true, language: true, studyForm: true },
        })
      : null;

    await prisma.studentProfile.create({
      data: {
        userId: user.id,
        programId: data.programId!,
        groupId: group?.id ?? null,
        studyYear: data.studyYear,
        studyForm: group?.studyForm ?? 'DISTANCE',
        language: group?.language ?? data.uiLanguage,
        admissionYear: new Date().getFullYear(),
      },
    });
  }

  if (needsTeacherProfile) {
    await prisma.teacherProfile.create({
      data: {
        userId: user.id,
        departmentId: data.departmentId!,
        position: data.position || 'Преподаватель',
      },
    });
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.USER_CREATE,
    entityType: 'User',
    entityId: user.id,
    newValue: { email: data.email, role: data.roleCode },
  });

  revalidatePath('/admin/users');
  return { ok: true, email: data.email, password, generated };
}

export async function setUserStatus(userId: string, status: 'ACTIVE' | 'BLOCKED') {
  const actor = await requirePermission('user:manage');
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { status: true, email: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { status } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.USER_BLOCK,
    entityType: 'User',
    entityId: userId,
    oldValue: { status: before.status },
    newValue: { status, email: before.email },
  });

  revalidatePath('/admin/users');
}

export async function resetUserPassword(userId: string): Promise<string> {
  const actor = await requirePermission('user:manage');
  const password = generatePassword();

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
    },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    entityType: 'User',
    entityId: userId,
    newValue: { byAdmin: true },
  });

  revalidatePath('/admin/users');
  return password;
}

export async function toggleUserRole(userId: string, roleCode: string, grant: boolean) {
  const actor = await requirePermission('user:manage');
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode as never } });

  if (grant) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, grantedBy: actor.id },
      update: {},
    });
  } else {
    await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: grant ? AUDIT_ACTIONS.ROLE_GRANT : AUDIT_ACTIONS.ROLE_REVOKE,
    entityType: 'UserRole',
    entityId: userId,
    newValue: { roleCode, grant },
  });

  revalidatePath('/admin/users');
}

// ── Академические периоды (F-A-01) ──────────────────────────────────────────

const periodSchema = z.object({
  academicYearId: z.string(),
  name: z.string().min(1),
  type: z.enum(['SEMESTER', 'TRIMESTER', 'SUMMER']).default('SEMESTER'),
  ordinal: z.coerce.number().int().min(1).max(4),
  startDate: z.string(),
  endDate: z.string(),
  registrationStart: z.string(),
  registrationEnd: z.string(),
  examStart: z.string(),
  examEnd: z.string(),
});

export async function createPeriod(input: z.infer<typeof periodSchema>) {
  await requirePermission('period:manage');
  const d = periodSchema.parse(input);

  await prisma.academicPeriod.create({
    data: {
      academicYearId: d.academicYearId,
      name: d.name,
      type: d.type,
      ordinal: d.ordinal,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      registrationStart: new Date(d.registrationStart),
      registrationEnd: new Date(d.registrationEnd),
      examStart: new Date(d.examStart),
      examEnd: new Date(d.examEnd),
    },
  });

  revalidatePath('/admin/periods');
}

export async function setPeriodStatus(
  periodId: string,
  status: 'PLANNED' | 'REGISTRATION' | 'ACTIVE' | 'EXAMS' | 'CLOSED'
) {
  const actor = await requirePermission('period:manage');
  await prisma.academicPeriod.update({ where: { id: periodId }, data: { status } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'PERIOD_STATUS',
    entityType: 'AcademicPeriod',
    entityId: periodId,
    newValue: { status },
  });

  revalidatePath('/admin/periods');
}

export async function setCurrentPeriod(periodId: string) {
  await requirePermission('period:manage');
  await prisma.$transaction([
    prisma.academicPeriod.updateMany({ data: { isCurrent: false } }),
    prisma.academicPeriod.update({ where: { id: periodId }, data: { isCurrent: true } }),
  ]);
  revalidatePath('/admin/periods');
}

// ── Курсы и назначения (F-A-04) ─────────────────────────────────────────────

export async function createCourse(input: {
  disciplineId: string;
  periodId: string;
  streamName?: string;
  teacherIds: string[];
  leadTeacherId?: string;
}) {
  await requirePermission('enrollment:manage');

  const discipline = await prisma.discipline.findUniqueOrThrow({
    where: { id: input.disciplineId },
    select: { code: true, nameRu: true },
  });
  const period = await prisma.academicPeriod.findUniqueOrThrow({
    where: { id: input.periodId },
    select: { name: true, academicYear: { select: { name: true } } },
  });

  const slug = slugify(
    `${discipline.code} ${discipline.nameRu} ${period.academicYear.name} ${period.name} ${input.streamName ?? ''}`
  );

  const course = await prisma.course.create({
    data: {
      disciplineId: input.disciplineId,
      periodId: input.periodId,
      streamName: input.streamName || null,
      slug: `${slug}-${Date.now().toString(36)}`,
      teachers: {
        create: input.teacherIds.map((teacherId) => ({
          teacherId,
          isLead: teacherId === (input.leadTeacherId ?? input.teacherIds[0]),
        })),
      },
      questionBank: { create: {} },
    },
  });

  revalidatePath('/admin/enrollments');
  return course.id;
}

/** F-A-04. Массовая регистрация студентов на курс. */
export async function enrollStudents(courseId: string, studentIds: string[]) {
  const actor = await requirePermission('enrollment:manage');

  await prisma.$transaction(
    studentIds.map((studentId) =>
      prisma.enrollment.upsert({
        where: { courseId_studentId: { courseId, studentId } },
        create: { courseId, studentId, source: 'manual' },
        update: { cancelledAt: null },
      })
    )
  );

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ENROLLMENT_CREATE,
    entityType: 'Enrollment',
    entityId: courseId,
    newValue: { count: studentIds.length },
  });

  revalidatePath('/admin/enrollments');
  return studentIds.length;
}

/** Регистрация всей группы на курс (F-A-04) */
export async function enrollGroup(courseId: string, groupId: string) {
  await requirePermission('enrollment:manage');
  const students = await prisma.studentProfile.findMany({
    where: { groupId, status: 'ACTIVE' },
    select: { id: true },
  });
  return enrollStudents(courseId, students.map((s) => s.id));
}

export async function cancelEnrollment(courseId: string, studentId: string) {
  const actor = await requirePermission('enrollment:manage');
  await prisma.enrollment.update({
    where: { courseId_studentId: { courseId, studentId } },
    data: { cancelledAt: new Date() },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ENROLLMENT_CANCEL,
    entityType: 'Enrollment',
    entityId: `${courseId}:${studentId}`,
  });

  revalidatePath('/admin/enrollments');
}

// ── Согласование курсов (роль «Методист кафедры») ────────────────────────────

export async function decideCourseReview(
  courseId: string,
  approved: boolean,
  comment?: string
) {
  const actor = await requirePermission('course:review');
  await reviewCourse({
    courseId,
    approved,
    comment,
    actorId: actor.id,
    actorEmail: actor.email,
  });
  revalidatePath('/admin/gradesheets');
  revalidatePath(`/admin/courses/${courseId}/review`);
}

// ── Настройки (F-A-08) ──────────────────────────────────────────────────────

export async function updateSettings(values: Record<string, string>) {
  const actor = await requirePermission('settings:manage');

  const before = await prisma.systemSetting.findMany({
    where: { key: { in: Object.keys(values) } },
  });
  const beforeMap = Object.fromEntries(before.map((s) => [s.key, s.value]));

  for (const [key, value] of Object.entries(values)) {
    await setSetting(key, value, actor.id);
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.SETTING_UPDATE,
    entityType: 'SystemSetting',
    oldValue: beforeMap,
    newValue: values,
  });

  revalidatePath('/admin/settings');
}

// ── Интеграция (раздел 9) ───────────────────────────────────────────────────

/**
 * Раздел 9.1, п. 5: передача итоговых оценок выполняется по явному
 * подтверждению офиса регистратора, а не автоматически.
 */
export async function approveOutboxEvent(eventId: string) {
  const actor = await requirePermission('integration:approve_final');

  await prisma.integrationOutbox.update({
    where: { id: eventId },
    data: { approvedById: actor.id, approvedAt: new Date() },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.OUTBOX_APPROVE,
    entityType: 'IntegrationOutbox',
    entityId: eventId,
  });

  revalidatePath('/admin/integrations');
}

export async function queueFinalGrades(courseId: string) {
  await requirePermission('integration:approve_final');
  const count = await enqueueFinalGrades(courseId);
  revalidatePath('/admin/integrations');
  return count;
}

export async function retryOutboxEvent(eventId: string) {
  await requirePermission('integration:manage');
  await prisma.integrationOutbox.update({
    where: { id: eventId },
    data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0, lastError: null },
  });
  revalidatePath('/admin/integrations');
}
