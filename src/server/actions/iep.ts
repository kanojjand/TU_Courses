'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requirePermission, requireUser, AccessError } from '@/server/guards';
import { hasRole } from '@/lib/rbac';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { loadIepWorkspace, loadStudentHistory, promoteFromWaitlist } from '@/server/iep';
import { creditsInYear, isWindowOpen, nextAttemptNo, placeRegistration } from '@/domain/iep';

/**
 * ИУП и регистрация на дисциплины — F-IEP-01…F-IEP-07.
 *
 * Все проверки, влияющие на нормативы, продублированы здесь, на сервере:
 * интерфейс скрывает недоступные дисциплины, но прямой вызов действия
 * интерфейс не проходит.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/my/iep', 'page');
  revalidatePath('/[locale]/advisor', 'page');
  revalidatePath('/[locale]/admin/ieps', 'page');
  revalidatePath('/[locale]/my/courses', 'page');
}

/** Профиль обучающегося текущего пользователя */
async function requireOwnStudent() {
  const user = await requirePermission('iep:manage_own');
  if (!user.studentProfileId) {
    throw new AccessError('Профиль обучающегося не найден.', 'NOT_FOUND');
  }
  return { user, studentId: user.studentProfileId };
}

// ── Формирование ИУП ────────────────────────────────────────────────────────

const selectionsSchema = z.object({
  academicYearId: z.string().trim().min(1),
  selections: z
    .array(
      z.object({
        slotId: z.string().trim().min(1),
        disciplineId: z.string().trim().min(1),
      })
    )
    .max(60),
});

/**
 * F-IEP-01. Сохранение выбора студента.
 *
 * ИУП пересобирается целиком из переданного выбора: обязательные позиции
 * подставляются автоматически, элективные берутся из выбора. Строки, снятые
 * студентом, удаляются — но только те, по которым ещё нет регистрации:
 * иначе снятие строки молча оборвало бы уже открытую регистрацию.
 */
export async function saveIepSelections(
  input: z.input<typeof selectionsSchema>
): Promise<Result<{ iepId: string; credits: number }>> {
  const { studentId } = await requireOwnStudent();
  const parsed = selectionsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте выбор.');
  const { academicYearId, selections } = parsed.data;

  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentId },
    select: { studyYear: true, advisorId: true },
  });

  const existing = await prisma.iep.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    return fail(
      'ИУП уже отправлен на согласование. Изменения возможны после возврата эдвайзером.'
    );
  }

  const workspace = await loadIepWorkspace({
    studentId,
    academicYearId,
    studyYear: student.studyYear,
    selections,
  });
  if (!workspace) {
    return fail(
      'Для вашей программы и года набора нет утверждённого учебного плана. ' +
        'Обратитесь в офис Регистратора.'
    );
  }

  // Строки ИУП: автоматические позиции плюс сделанный выбор
  const rows = workspace.plan.offers.flatMap((offer) => {
    const picked = offer.isAutomatic
      ? offer.options.slice(0, 1).map((o) => o.disciplineId)
      : selections.filter((s) => s.slotId === offer.slot.id).map((s) => s.disciplineId);

    return picked.map((disciplineId) => ({
      slotId: offer.slot.id,
      disciplineId,
      termNo: offer.slot.controlTerm ?? offer.slot.terms[0] ?? workspace.terms[0],
      credits: new Prisma.Decimal(creditsInYear(offer.slot, workspace.terms)),
      isRetake: offer.options.find((o) => o.disciplineId === disciplineId)?.needsRetake ?? false,
      isMinor: offer.slot.isMinorSlot,
    }));
  });

  const totalCredits = rows.reduce((a, r) => a + Number(r.credits), 0);

  const iep = await prisma.$transaction(async (tx) => {
    const saved = await tx.iep.upsert({
      where: { studentId_academicYearId: { studentId, academicYearId } },
      create: {
        studentId,
        academicYearId,
        curriculumId: workspace.curriculum.id,
        totalCredits: new Prisma.Decimal(totalCredits),
        status: 'DRAFT',
      },
      update: {
        curriculumId: workspace.curriculum.id,
        totalCredits: new Prisma.Decimal(totalCredits),
        status: 'DRAFT',
        advisorComment: null,
      },
      select: { id: true },
    });

    // Строки с открытой регистрацией не трогаем: снятие такой строки
    // оставило бы регистрацию без основания
    const locked = await tx.iepItem.findMany({
      where: { iepId: saved.id, registrations: { some: { cancelledAt: null } } },
      select: { slotId: true, disciplineId: true },
    });
    const lockedKeys = new Set(locked.map((l) => `${l.slotId}:${l.disciplineId}`));

    await tx.iepItem.deleteMany({
      where: {
        iepId: saved.id,
        registrations: { none: {} },
      },
    });

    const toCreate = rows.filter((r) => !lockedKeys.has(`${r.slotId}:${r.disciplineId}`));
    for (const row of toCreate) {
      await tx.iepItem.upsert({
        where: {
          iepId_slotId_disciplineId: {
            iepId: saved.id,
            slotId: row.slotId,
            disciplineId: row.disciplineId,
          },
        },
        create: { iepId: saved.id, ...row },
        update: { termNo: row.termNo, credits: row.credits, isRetake: row.isRetake },
      });
    }
    return saved;
  });

  revalidate();
  return { ok: true, data: { iepId: iep.id, credits: totalCredits } };
}

/**
 * F-IEP-04, R-15. Отправка ИУП эдвайзеру.
 *
 * ИУП с блокирующими замечаниями не отправляется: эдвайзеру незачем
 * согласовывать план, который заведомо нарушает правила.
 */
export async function submitIep(academicYearId: string): Promise<Result> {
  const { user, studentId } = await requireOwnStudent();

  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      studyYear: true,
      advisor: { select: { userId: true } },
    },
  });

  const workspace = await loadIepWorkspace({
    studentId,
    academicYearId,
    studyYear: student.studyYear,
  });
  if (!workspace) return fail('Учебный план не найден.');

  const errors = workspace.plan.issues.filter((i) => i.level === 'ERROR');
  if (errors.length > 0) {
    return fail('ИУП не может быть отправлен: ' + errors.map((e) => e.message).join(' '));
  }

  const iep = await prisma.iep.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    select: { id: true, status: true },
  });
  if (!iep) return fail('Сначала сохраните ИУП.');
  if (iep.status !== 'DRAFT' && iep.status !== 'REJECTED') {
    return fail('ИУП уже отправлен на согласование.');
  }

  await prisma.iep.update({
    where: { id: iep.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      advisorId: student.advisor?.userId ?? null,
      advisorComment: null,
    },
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.IEP_SUBMIT,
    entityType: 'Iep',
    entityId: iep.id,
    newValue: { credits: workspace.plan.selectedCredits },
  });

  revalidate();
  return { ok: true };
}

// ── Согласование эдвайзером и фиксация офисом Регистратора ─────────────────

/** Эдвайзер согласует ИУП только закреплённых за ним студентов */
async function requireIepReviewer(iepId: string) {
  const user = await requirePermission('iep:approve');
  const iep = await prisma.iep.findUnique({
    where: { id: iepId },
    select: {
      id: true,
      status: true,
      studentId: true,
      student: { select: { advisorId: true } },
    },
  });
  if (!iep) throw new AccessError('ИУП не найден.', 'NOT_FOUND');

  if (hasRole(user, 'ADMIN', 'REGISTRAR')) return { user, iep };
  if (!user.teacherProfileId || iep.student.advisorId !== user.teacherProfileId) {
    throw new AccessError('Обучающийся не закреплён за вами.');
  }
  return { user, iep };
}

export async function approveIep(iepId: string): Promise<Result> {
  const { user, iep } = await requireIepReviewer(iepId);
  if (iep.status !== 'SUBMITTED') {
    return fail('Согласовать можно только ИУП, отправленный студентом.');
  }

  await prisma.iep.update({
    where: { id: iepId },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), advisorComment: null },
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.IEP_APPROVE,
    entityType: 'Iep',
    entityId: iepId,
  });

  revalidate();
  return { ok: true };
}

const rejectSchema = z.object({
  iepId: z.string().trim().min(1),
  comment: z.string().trim().min(10, 'Опишите, что нужно исправить — не менее 10 символов.'),
});

export async function rejectIep(input: z.input<typeof rejectSchema>): Promise<Result> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { iepId, comment } = parsed.data;

  const { user, iep } = await requireIepReviewer(iepId);
  if (iep.status !== 'SUBMITTED') return fail('Вернуть можно только отправленный ИУП.');

  await prisma.iep.update({
    where: { id: iepId },
    data: { status: 'REJECTED', advisorComment: comment },
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.IEP_REJECT,
    entityType: 'Iep',
    entityId: iepId,
    reason: comment,
  });

  revalidate();
  return { ok: true };
}

/** F-IEP-04, последний шаг маршрута: офис Регистратора фиксирует ИУП */
export async function confirmIep(iepId: string): Promise<Result> {
  const user = await requirePermission('iep:confirm');
  const iep = await prisma.iep.findUnique({
    where: { id: iepId },
    select: { status: true },
  });
  if (!iep) return fail('ИУП не найден.');
  if (iep.status !== 'APPROVED') {
    return fail('Зафиксировать можно только ИУП, согласованный эдвайзером.');
  }

  await prisma.iep.update({
    where: { id: iepId },
    data: { status: 'CONFIRMED', confirmedById: user.id, confirmedAt: new Date() },
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.IEP_CONFIRM,
    entityType: 'Iep',
    entityId: iepId,
  });

  revalidate();
  return { ok: true };
}

// ── Регистрация на реализации дисциплин ────────────────────────────────────

/**
 * Открытое окно регистрации нужного вида для периода.
 * Офис Регистратора и администратор регистрируют вне окна — это их работа.
 */
async function assertWindowOpen(
  periodId: string,
  kinds: ('MAIN' | 'ADD_DROP' | 'SUMMER' | 'RETAKE')[],
  bypass: boolean
): Promise<Result> {
  if (bypass) return { ok: true };

  const windows = await prisma.registrationWindow.findMany({
    where: { periodId, kind: { in: kinds } },
    select: { kind: true, opensAt: true, closesAt: true },
  });
  const open = windows.find((w) => isWindowOpen(w));
  if (open) return { ok: true };

  const next = windows
    .filter((w) => w.opensAt > new Date())
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())[0];

  return fail(
    next
      ? `Окно регистрации закрыто. Ближайшее открывается ${next.opensAt.toLocaleString('ru-RU')}.`
      : 'Окно регистрации на этот период закрыто.'
  );
}

const registerSchema = z.object({
  iepItemId: z.string().trim().min(1),
  courseId: z.string().trim().min(1),
});

/**
 * F-IEP-05. Регистрация на реализацию дисциплины.
 *
 * Проверяется: строка принадлежит ИУП студента, ИУП согласован (R-15),
 * окно открыто, пререквизиты освоены (R-14), квота не исчерпана —
 * иначе лист ожидания.
 */
export async function registerForCourse(
  input: z.input<typeof registerSchema>
): Promise<Result<{ status: string; waitlistPos: number | null }>> {
  const user = await requireUser();
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте параметры.');
  const { iepItemId, courseId } = parsed.data;

  const item = await prisma.iepItem.findUnique({
    where: { id: iepItemId },
    select: {
      id: true,
      disciplineId: true,
      credits: true,
      isRetake: true,
      iep: { select: { id: true, status: true, studentId: true } },
    },
  });
  if (!item) return fail('Строка ИУП не найдена.');

  const isOwner = user.studentProfileId === item.iep.studentId;
  const isOffice = hasRole(user, 'REGISTRAR', 'ADMIN');
  if (!isOwner && !isOffice) throw new AccessError('Недостаточно прав.');

  // R-15: регистрация идёт по утверждённому ИУП
  if (isOwner && item.iep.status !== 'APPROVED' && item.iep.status !== 'CONFIRMED') {
    return fail('Регистрация открывается после согласования ИУП эдвайзером.');
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      disciplineId: true,
      maxEnrollment: true,
      status: true,
      periodId: true,
      period: { select: { type: true } },
    },
  });
  if (!course) return fail('Реализация дисциплины не найдена.');
  if (course.disciplineId !== item.disciplineId) {
    return fail('Курс относится к другой дисциплине, чем строка ИУП.');
  }
  if (course.status === 'DRAFT' || course.status === 'ON_REVIEW' || course.status === 'REJECTED') {
    return fail('Курс ещё не готов к регистрации.');
  }

  const kinds: ('MAIN' | 'ADD_DROP' | 'SUMMER' | 'RETAKE')[] = item.isRetake
    ? ['RETAKE', 'SUMMER', 'MAIN']
    : course.period.type === 'SUMMER'
      ? ['SUMMER', 'MAIN']
      : ['MAIN', 'ADD_DROP'];
  const windowCheck = await assertWindowOpen(course.periodId, kinds, isOffice);
  if (!windowCheck.ok) return windowCheck;

  // R-14: пререквизиты проверяются и здесь, а не только в мастере
  const [prereqs, history] = await Promise.all([
    prisma.disciplineLink.findMany({
      where: { sourceId: item.disciplineId, isPrerequisite: true },
      select: { targetId: true },
    }),
    loadStudentHistory(item.iep.studentId),
  ]);
  const completed = new Set(history.completedDisciplineIds);
  const missing = prereqs.filter((p) => !completed.has(p.targetId));
  if (missing.length > 0) {
    return fail(
      `Не освоены пререквизиты дисциплины: ${missing.length}. ` +
        'Регистрация невозможна (правило R-14).'
    );
  }

  const previous = await prisma.enrollment.findMany({
    where: { courseId, studentId: item.iep.studentId },
    select: { attemptNo: true, cancelledAt: true },
  });
  if (previous.some((p) => !p.cancelledAt)) {
    return fail('Вы уже зарегистрированы на эту дисциплину.');
  }

  const [registeredCount, waitlistCount] = await Promise.all([
    prisma.enrollment.count({ where: { courseId, status: 'REGISTERED', cancelledAt: null } }),
    prisma.enrollment.count({ where: { courseId, status: 'WAITLISTED', cancelledAt: null } }),
  ]);
  const placement = placeRegistration({
    capacity: course.maxEnrollment,
    registeredCount,
    waitlistCount,
  });

  await prisma.enrollment.create({
    data: {
      courseId,
      studentId: item.iep.studentId,
      iepItemId: item.id,
      status: placement.status,
      waitlistPos: placement.waitlistPos,
      attemptNo: nextAttemptNo(previous),
      source: 'iep',
    },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.REGISTRATION_CREATE,
    entityType: 'Enrollment',
    entityId: `${courseId}:${item.iep.studentId}`,
    newValue: { status: placement.status, waitlistPos: placement.waitlistPos },
  });

  revalidate();
  return { ok: true, data: placement };
}

/**
 * F-IEP-06. Снятие регистрации в окне add/drop.
 *
 * Освободившееся место передаётся первому в листе ожидания — иначе лист
 * ожидания был бы бесполезен: место освободилось, а зачислять некому.
 */
export async function dropRegistration(enrollmentId: string): Promise<Result> {
  const user = await requireUser();
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      status: true,
      cancelledAt: true,
      course: { select: { periodId: true, maxEnrollment: true } },
    },
  });
  if (!enrollment) return fail('Регистрация не найдена.');
  if (enrollment.cancelledAt) return fail('Регистрация уже снята.');

  const isOwner = user.studentProfileId === enrollment.studentId;
  const isOffice = hasRole(user, 'REGISTRAR', 'ADMIN');
  if (!isOwner && !isOffice) throw new AccessError('Недостаточно прав.');

  const windowCheck = await assertWindowOpen(
    enrollment.course.periodId,
    ['ADD_DROP', 'MAIN'],
    isOffice
  );
  if (!windowCheck.ok) return windowCheck;

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: { cancelledAt: new Date(), status: 'DROPPED', waitlistPos: null },
    });

    // Место освобождается только если оно было занято, а не в листе ожидания
    if (enrollment.status !== 'REGISTERED') return;
    await promoteFromWaitlist(tx, enrollment.courseId);
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.REGISTRATION_DROP,
    entityType: 'Enrollment',
    entityId: enrollmentId,
    oldValue: { status: enrollment.status },
  });

  revalidate();
  return { ok: true };
}
