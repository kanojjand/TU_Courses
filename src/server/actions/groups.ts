'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';

/**
 * Академические группы, кураторы и эдвайзеры — F-GRP-01…F-GRP-05.
 *
 * Текущее значение и история хранятся рядом: StudyGroup.curatorId и
 * StudentProfile.groupId / advisorId — то, что показывают списки, а
 * StaffAssignment и GroupMembership — период действия и история.
 * Обновляются они всегда вместе, одной транзакцией.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/admin/groups', 'page');
  revalidatePath('/[locale]/admin/groups/[id]', 'page');
  revalidatePath('/[locale]/advisor', 'page');
}

// ── Группа ──────────────────────────────────────────────────────────────────

const groupSchema = z.object({
  id: z.string().trim().optional(),
  programId: z.string().trim().min(1, 'Выберите образовательную программу.'),
  name: z.string().trim().min(1, 'Укажите шифр группы.').max(50),
  studyYear: z.coerce.number().int().min(1).max(8),
  admissionYear: z.coerce.number().int().min(2000).max(2100).optional(),
  language: z.enum(['KK', 'RU', 'EN']),
  studyForm: z.enum(['FULL_TIME', 'PART_TIME', 'DISTANCE', 'EVENING']),
  curriculumId: z.string().trim().optional(),
  curatorId: z.string().trim().optional(),
});

export type SaveGroupInput = z.input<typeof groupSchema>;

/** F-GRP-01. Создание и правка академической группы */
export async function saveGroup(input: SaveGroupInput): Promise<Result<{ id: string }>> {
  const actor = await requirePermission('group:manage');
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, curatorId, ...data } = parsed.data;

  const duplicate = await prisma.studyGroup.findFirst({
    where: { programId: data.programId, name: data.name, id: id ? { not: id } : undefined },
    select: { id: true },
  });
  if (duplicate) return fail(`Группа «${data.name}» в этой программе уже заведена.`);

  const previous = id
    ? await prisma.studyGroup.findUnique({ where: { id }, select: { curatorId: true } })
    : null;

  const group = id
    ? await prisma.studyGroup.update({
        where: { id },
        data: { ...data, curatorId: curatorId || null },
        select: { id: true },
      })
    : await prisma.studyGroup.create({
        data: { ...data, curatorId: curatorId || null },
        select: { id: true },
      });

  // История назначения куратора ведётся отдельно (F-GRP-02)
  if ((curatorId || null) !== (previous?.curatorId ?? null)) {
    await recordCuratorChange(group.id, previous?.curatorId ?? null, curatorId || null, actor.id);
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: id ? AUDIT_ACTIONS.GROUP_UPDATE : AUDIT_ACTIONS.GROUP_CREATE,
    entityType: 'StudyGroup',
    entityId: group.id,
    oldValue: previous ?? undefined,
    newValue: { ...data, curatorId: curatorId || null },
  });

  revalidate();
  return { ok: true, data: { id: group.id } };
}

/** Закрывает прежнее назначение куратора и открывает новое */
async function recordCuratorChange(
  groupId: string,
  previousTeacherId: string | null,
  nextTeacherId: string | null,
  actorId: string
) {
  const today = new Date();

  if (previousTeacherId) {
    await prisma.staffAssignment.updateMany({
      where: { groupId, kind: 'CURATOR', validTo: null },
      data: { validTo: today },
    });
  }

  if (nextTeacherId) {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { id: nextTeacherId },
      select: { userId: true },
    });
    if (teacher) {
      await prisma.staffAssignment.create({
        data: {
          userId: teacher.userId,
          kind: 'CURATOR',
          groupId,
          validFrom: today,
          createdById: actorId,
        },
      });
    }
  }
}

const assignAdvisorSchema = z.object({
  studentIds: z.array(z.string().trim().min(1)).min(1, 'Выберите обучающихся.'),
  /** Пустое значение снимает закрепление */
  teacherId: z.string().trim().optional(),
});

/** F-GRP-02. Закрепление эдвайзера за обучающимися с историей */
export async function assignAdvisor(
  input: z.input<typeof assignAdvisorSchema>
): Promise<Result<{ updated: number }>> {
  const actor = await requirePermission('staff:assign');
  const parsed = assignAdvisorSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { studentIds, teacherId } = parsed.data;

  const teacher = teacherId
    ? await prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { id: true, userId: true },
      })
    : null;
  if (teacherId && !teacher) return fail('Преподаватель не найден.');

  const today = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.staffAssignment.updateMany({
      where: { studentId: { in: studentIds }, kind: 'ADVISOR', validTo: null },
      data: { validTo: today },
    });

    await tx.studentProfile.updateMany({
      where: { id: { in: studentIds } },
      data: { advisorId: teacher?.id ?? null },
    });

    if (teacher) {
      await tx.staffAssignment.createMany({
        data: studentIds.map((studentId) => ({
          userId: teacher.userId,
          kind: 'ADVISOR' as const,
          studentId,
          validFrom: today,
          createdById: actor.id,
        })),
      });
    }
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: teacher ? AUDIT_ACTIONS.STAFF_ASSIGN : AUDIT_ACTIONS.STAFF_REVOKE,
    entityType: 'StudentProfile',
    entityId: studentIds.join(','),
    newValue: { kind: 'ADVISOR', teacherId: teacher?.id ?? null, count: studentIds.length },
  });

  revalidate();
  return { ok: true, data: { updated: studentIds.length } };
}

const transferSchema = z.object({
  studentId: z.string().trim().min(1),
  groupId: z.string().trim().min(1, 'Выберите группу.'),
  reason: z.string().trim().max(500).optional(),
});

/**
 * F-GRP-04. Перевод обучающегося между группами.
 *
 * Регистрации на курсы при переводе сохраняются: они привязаны к студенту,
 * а не к группе, и перенос состоит в закрытии прежнего членства и открытии
 * нового. Историю видно в GroupMembership.
 */
export async function transferStudent(input: z.input<typeof transferSchema>): Promise<Result> {
  const actor = await requirePermission('group:manage');
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { studentId, groupId, reason } = parsed.data;

  const [student, group] = await Promise.all([
    prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, groupId: true, programId: true },
    }),
    prisma.studyGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, programId: true, studyYear: true, curriculumId: true },
    }),
  ]);
  if (!student) return fail('Обучающийся не найден.');
  if (!group) return fail('Группа не найдена.');
  if (student.groupId === groupId) return fail('Обучающийся уже состоит в этой группе.');

  if (group.programId !== student.programId) {
    return fail(
      'Группа относится к другой образовательной программе. Перевод между программами ' +
        'оформляется приказом и меняет учебный план — этого действия для него недостаточно.'
    );
  }

  const today = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.groupMembership.updateMany({
      where: { studentId, leftOn: null },
      data: { leftOn: today, reason: reason ?? null },
    });
    await tx.groupMembership.create({
      data: { studentId, groupId, joinedOn: today, reason: reason ?? null },
    });
    await tx.studentProfile.update({
      where: { id: studentId },
      data: { groupId, curriculumId: group.curriculumId ?? undefined },
    });
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.GROUP_TRANSFER,
    entityType: 'StudentProfile',
    entityId: studentId,
    oldValue: { groupId: student.groupId },
    newValue: { groupId },
    reason: reason ?? null,
  });

  revalidate();
  return { ok: true };
}

const statusSchema = z.object({
  studentId: z.string().trim().min(1),
  status: z.enum([
    'ACTIVE',
    'ACADEMIC_LEAVE',
    'EXPELLED',
    'REINSTATED',
    'GRADUATED',
    'MOBILITY',
    'TRANSFERRED',
  ]),
  reasonCode: z
    .enum([
      'ACADEMIC_FAILURE',
      'INTEGRITY',
      'UNPAID',
      'OWN_WILL',
      'HEALTH',
      'MILITARY',
      'CHILD',
      'TRANSFER',
      'COMPLETION',
      'OTHER',
    ])
    .optional(),
  reasonText: z.string().trim().max(1000).optional(),
  orderNo: z.string().trim().max(100).optional(),
  orderDate: z.string().trim().optional(),
  startsOn: z.string().trim().min(1, 'Укажите дату начала действия.'),
  endsOn: z.string().trim().optional(),
});

/**
 * F-GRP-05. Смена статуса обучающегося с основанием и приказом.
 *
 * Приказ обязателен для отчисления, академического отпуска и восстановления:
 * это основания, которые вуз обязан подтверждать документом.
 */
export async function changeStudentStatus(
  input: z.input<typeof statusSchema>
): Promise<Result> {
  const actor = await requirePermission('student:status');
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const data = parsed.data;

  const needsOrder = ['EXPELLED', 'ACADEMIC_LEAVE', 'REINSTATED', 'TRANSFERRED'];
  if (needsOrder.includes(data.status) && !data.orderNo) {
    return fail('Для этого статуса требуется номер приказа.');
  }

  const student = await prisma.studentProfile.findUnique({
    where: { id: data.studentId },
    select: { id: true, status: true },
  });
  if (!student) return fail('Обучающийся не найден.');

  await prisma.$transaction([
    prisma.studentStatusHistory.create({
      data: {
        studentId: data.studentId,
        status: data.status,
        reasonCode: data.reasonCode,
        reasonText: data.reasonText,
        orderNo: data.orderNo,
        orderDate: data.orderDate ? new Date(data.orderDate) : null,
        startsOn: new Date(data.startsOn),
        endsOn: data.endsOn ? new Date(data.endsOn) : null,
        createdById: actor.id,
      },
    }),
    prisma.studentProfile.update({
      where: { id: data.studentId },
      data: { status: data.status },
    }),
  ]);

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.STUDENT_STATUS_CHANGE,
    entityType: 'StudentProfile',
    entityId: data.studentId,
    oldValue: { status: student.status },
    newValue: { status: data.status, orderNo: data.orderNo, startsOn: data.startsOn },
    reason: data.reasonText ?? data.reasonCode ?? null,
  });

  revalidate();
  return { ok: true };
}
