'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma, dec } from '@/lib/prisma';
import { requirePermission, requireUser, AccessError } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { appealWindowDays, makeGpaSnapshot } from '@/server/assessment';
import { letterForScore, STANDARD_GRADE_SCALE } from '@/domain/grading';

/**
 * Апелляции, перезачёт кредитов и снимки GPA — F-ASM-04, F-ASM-06, F-ASM-10.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/my/grades', 'page');
  revalidatePath('/[locale]/admin/appeals', 'page');
  revalidatePath('/[locale]/admin/gradesheets', 'page');
}

// ── Апелляция (F-ASM-04) ────────────────────────────────────────────────────

const fileSchema = z.object({
  periodGradeId: z.string().trim().min(1),
  reason: z.string().trim().min(20, 'Опишите основание апелляции — не менее 20 символов.').max(2000),
});

/**
 * Подача апелляции обучающимся.
 *
 * Срок подачи ограничен окном после закрытия ведомости: апелляция на оценку
 * прошлого года смысла не имеет, а норма требует «установленного срока».
 */
export async function fileAppeal(input: z.input<typeof fileSchema>): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.studentProfileId) throw new AccessError('Профиль обучающегося не найден.');

  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { periodGradeId, reason } = parsed.data;

  const grade = await prisma.periodGrade.findUnique({
    where: { id: periodGradeId },
    select: {
      id: true,
      studentId: true,
      isFinalized: true,
      finalScore: true,
      letter: true,
      courseId: true,
      course: { select: { gradeSheets: { where: { controlPeriod: 'EXAM' }, select: { closedAt: true } } } },
    },
  });
  if (!grade) return fail('Оценка не найдена.');
  if (grade.studentId !== user.studentProfileId) {
    throw new AccessError('Апелляция подаётся только на собственную оценку.');
  }
  if (!grade.isFinalized) {
    return fail('Апелляция подаётся на итоговую оценку после закрытия ведомости.');
  }

  const closedAt = grade.course.gradeSheets[0]?.closedAt;
  if (closedAt) {
    const days = await appealWindowDays();
    const deadline = new Date(closedAt.getTime() + days * 24 * 3600 * 1000);
    if (new Date() > deadline) {
      return fail(
        `Срок подачи апелляции истёк ${deadline.toLocaleDateString('ru-RU')} ` +
          `(${days} ${days === 1 ? 'день' : 'дня'} после закрытия ведомости).`
      );
    }
  }

  const existing = await prisma.gradeAppeal.findFirst({
    where: { periodGradeId, status: { in: ['FILED', 'IN_REVIEW'] } },
    select: { id: true },
  });
  if (existing) return fail('По этой оценке уже подана апелляция и она на рассмотрении.');

  const appeal = await prisma.gradeAppeal.create({
    data: {
      periodGradeId,
      studentId: user.studentProfileId,
      reason,
      scoreBefore: grade.finalScore,
      letterBefore: grade.letter,
    },
    select: { id: true },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.APPEAL_FILE,
    entityType: 'GradeAppeal',
    entityId: appeal.id,
    newValue: { periodGradeId, letterBefore: grade.letter },
    reason,
  });

  revalidate();
  return { ok: true, data: { id: appeal.id } };
}

/** Обучающийся может отозвать поданную апелляцию до решения комиссии */
export async function withdrawAppeal(appealId: string): Promise<Result> {
  const user = await requireUser();
  const appeal = await prisma.gradeAppeal.findUnique({
    where: { id: appealId },
    select: { studentId: true, status: true },
  });
  if (!appeal) return fail('Апелляция не найдена.');
  if (appeal.studentId !== user.studentProfileId) throw new AccessError('Недостаточно прав.');
  if (appeal.status !== 'FILED') return fail('Отозвать можно только поданную апелляцию.');

  await prisma.gradeAppeal.update({ where: { id: appealId }, data: { status: 'WITHDRAWN' } });
  revalidate();
  return { ok: true };
}

const decideSchema = z.object({
  appealId: z.string().trim().min(1),
  status: z.enum(['IN_REVIEW', 'UPHELD', 'REJECTED']),
  decision: z.string().trim().max(2000).optional(),
  /** Новый итоговый балл — только при удовлетворении апелляции */
  newScore: z.coerce.number().min(0).max(100).optional(),
});

/**
 * Решение комиссии по апелляции.
 *
 * При удовлетворении итоговая оценка пересматривается здесь же, одной
 * транзакцией с решением: разнесённые действия оставляли бы удовлетворённую
 * апелляцию с неизменённой оценкой.
 */
export async function decideAppeal(input: z.input<typeof decideSchema>): Promise<Result> {
  const actor = await requirePermission('grade:edit_after_close');
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { appealId, status, decision, newScore } = parsed.data;

  const appeal = await prisma.gradeAppeal.findUnique({
    where: { id: appealId },
    select: {
      id: true,
      status: true,
      periodGradeId: true,
      periodGrade: { select: { finalScore: true, letter: true, studentId: true, periodId: true } },
    },
  });
  if (!appeal) return fail('Апелляция не найдена.');
  if (appeal.status === 'UPHELD' || appeal.status === 'REJECTED') {
    return fail('Решение по апелляции уже принято.');
  }

  if (status !== 'IN_REVIEW' && !decision) {
    return fail('Укажите решение комиссии.');
  }
  if (status === 'UPHELD' && newScore == null) {
    return fail('При удовлетворении апелляции укажите новый итоговый балл.');
  }

  const band = newScore != null ? letterForScore(newScore, STANDARD_GRADE_SCALE) : null;

  await prisma.$transaction(async (tx) => {
    await tx.gradeAppeal.update({
      where: { id: appealId },
      data: {
        status,
        decision: decision ?? null,
        scoreAfter: newScore != null ? new Prisma.Decimal(newScore) : null,
        letterAfter: band?.letter ?? null,
        decidedById: status === 'IN_REVIEW' ? null : actor.id,
        decidedAt: status === 'IN_REVIEW' ? null : new Date(),
      },
    });

    if (status === 'UPHELD' && band && newScore != null) {
      await tx.periodGrade.update({
        where: { id: appeal.periodGradeId },
        data: {
          finalScore: new Prisma.Decimal(newScore),
          letter: band.letter,
          gpaPoints: new Prisma.Decimal(band.gpaPoints),
          traditional: band.traditionalRu,
          ects: band.ects ?? null,
        },
      });
    }
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action:
      status === 'UPHELD'
        ? AUDIT_ACTIONS.APPEAL_UPHOLD
        : status === 'REJECTED'
          ? AUDIT_ACTIONS.APPEAL_REJECT
          : AUDIT_ACTIONS.APPEAL_REVIEW,
    entityType: 'GradeAppeal',
    entityId: appealId,
    oldValue: {
      score: appeal.periodGrade.finalScore ? dec(appeal.periodGrade.finalScore) : null,
      letter: appeal.periodGrade.letter,
    },
    newValue: { status, score: newScore ?? null, letter: band?.letter ?? null },
    reason: decision ?? null,
  });

  // Пересмотр оценки меняет GPA — снимок периода должен это отразить
  if (status === 'UPHELD') {
    await makeGpaSnapshot(appeal.periodGrade.studentId, appeal.periodGrade.periodId);
  }

  revalidate();
  return { ok: true };
}

// ── Перезачёт кредитов (F-ASM-10) ───────────────────────────────────────────

const transferSchema = z.object({
  id: z.string().trim().optional(),
  studentId: z.string().trim().min(1),
  sourceKind: z.enum(['TRANSFER', 'REINSTATEMENT', 'MOBILITY', 'NON_FORMAL', 'PRIOR_EDU']),
  sourceOrg: z.string().trim().max(300).optional(),
  sourceDisciplineName: z.string().trim().min(1, 'Укажите наименование дисциплины.').max(300),
  credits: z.coerce.number().positive('Кредиты должны быть больше нуля.').max(60),
  letter: z.string().trim().max(3).optional(),
  gpaPoint: z.coerce.number().min(0).max(4).optional(),
  slotId: z.string().trim().optional(),
  disciplineId: z.string().trim().optional(),
  documentRef: z.string().trim().max(300).optional(),
});

export type SaveTransferInput = z.input<typeof transferSchema>;

export async function saveCreditTransfer(input: SaveTransferInput): Promise<Result> {
  const actor = await requirePermission('grade:edit_after_close');
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, credits, gpaPoint, slotId, disciplineId, ...rest } = parsed.data;

  const data = {
    ...rest,
    credits: new Prisma.Decimal(credits),
    gpaPoint: gpaPoint != null ? new Prisma.Decimal(gpaPoint) : null,
    slotId: slotId || null,
    disciplineId: disciplineId || null,
  };

  const saved = id
    ? await prisma.creditTransfer.update({ where: { id }, data, select: { id: true } })
    : await prisma.creditTransfer.create({ data, select: { id: true } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CREDIT_TRANSFER_SAVE,
    entityType: 'CreditTransfer',
    entityId: saved.id,
    newValue: { studentId: rest.studentId, credits, sourceKind: rest.sourceKind },
  });

  revalidate();
  return { ok: true };
}

/**
 * Утверждение перезачёта.
 *
 * До утверждения кредиты в накопительный итог не входят: перезачёт
 * выполняется на основании верифицируемого транскрипта, и запись без
 * подтверждения — это заявка, а не результат.
 */
export async function approveCreditTransfer(id: string): Promise<Result> {
  const actor = await requirePermission('grade:edit_after_close');
  const transfer = await prisma.creditTransfer.findUnique({
    where: { id },
    select: { approvedAt: true, documentRef: true, studentId: true, credits: true },
  });
  if (!transfer) return fail('Запись о перезачёте не найдена.');
  if (transfer.approvedAt) return fail('Перезачёт уже утверждён.');
  if (!transfer.documentRef) {
    return fail('Укажите реквизиты транскрипта — перезачёт выполняется по верифицируемому документу.');
  }

  await prisma.creditTransfer.update({
    where: { id },
    data: { approvedById: actor.id, approvedAt: new Date() },
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CREDIT_TRANSFER_APPROVE,
    entityType: 'CreditTransfer',
    entityId: id,
    newValue: { studentId: transfer.studentId, credits: dec(transfer.credits) },
  });

  revalidate();
  return { ok: true };
}

export async function deleteCreditTransfer(id: string): Promise<Result> {
  await requirePermission('grade:edit_after_close');
  const transfer = await prisma.creditTransfer.findUnique({
    where: { id },
    select: { approvedAt: true },
  });
  if (!transfer) return fail('Запись не найдена.');
  if (transfer.approvedAt) {
    return fail('Утверждённый перезачёт не удаляется — он входит в историю достижений.');
  }

  await prisma.creditTransfer.delete({ where: { id } });
  revalidate();
  return { ok: true };
}

// ── Снимок GPA (F-ASM-06) ───────────────────────────────────────────────────

/** Снимки GPA по всем обучающимся периода — выполняется при его закрытии */
export async function snapshotPeriod(periodId: string): Promise<Result<{ count: number }>> {
  const actor = await requirePermission('period:manage');

  const students = await prisma.periodGrade.findMany({
    where: { periodId, isFinalized: true },
    select: { studentId: true },
    distinct: ['studentId'],
  });

  for (const s of students) await makeGpaSnapshot(s.studentId, periodId);

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.GPA_SNAPSHOT,
    entityType: 'AcademicPeriod',
    entityId: periodId,
    newValue: { students: students.length },
  });

  revalidate();
  return { ok: true, data: { count: students.length } };
}
