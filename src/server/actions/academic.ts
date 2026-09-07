'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { checkPeriodDuration, MIN_WEEKS_BY_PERIOD } from '@/domain/iep';

/**
 * Академический календарь — F-ACAD-01…F-ACAD-04.
 *
 * Валидация длительности периода (R-10) выполняется здесь же: период,
 * который короче норматива, сохранить нельзя. Проверка на клиенте только
 * подсказывает — блокирует сервер.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/admin/periods', 'page');
  revalidatePath('/[locale]/my/iep', 'page');
}

// ── Длительность периода (R-10) ─────────────────────────────────────────────

const durationSchema = z.object({
  periodId: z.string().trim().min(1),
  weeksCount: z.coerce.number().int().min(1).max(60),
});

/** F-ACAD-04. Проставление длительности периода с проверкой R-10 */
export async function setPeriodDuration(
  input: z.input<typeof durationSchema>
): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = durationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { periodId, weeksCount } = parsed.data;

  const period = await prisma.academicPeriod.findUnique({
    where: { id: periodId },
    select: { type: true, startDate: true, endDate: true, weeksCount: true },
  });
  if (!period) return fail('Академический период не найден.');

  const issue = checkPeriodDuration({ ...period, weeksCount });
  if (issue) return fail(issue.message);

  await prisma.academicPeriod.update({ where: { id: periodId }, data: { weeksCount } });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PERIOD_WINDOW_UPDATE,
    entityType: 'AcademicPeriod',
    entityId: periodId,
    oldValue: { weeksCount: period.weeksCount },
    newValue: { weeksCount },
  });

  revalidate();
  return { ok: true };
}

/** Отчёт R-10 по всем периодам учебного года — для панели администратора */
export async function checkCalendarDurations(academicYearId: string) {
  await requirePermission('period:manage');
  const periods = await prisma.academicPeriod.findMany({
    where: { academicYearId },
    select: {
      id: true,
      name: true,
      type: true,
      weeksCount: true,
      startDate: true,
      endDate: true,
    },
    orderBy: { ordinal: 'asc' },
  });

  return periods.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    weeksCount: p.weeksCount,
    requiredWeeks: MIN_WEEKS_BY_PERIOD[p.type] ?? 0,
    issue: checkPeriodDuration(p),
  }));
}

// ── Окна регистрации (F-ACAD-03) ────────────────────────────────────────────

const windowSchema = z
  .object({
    periodId: z.string().trim().min(1),
    kind: z.enum(['MAIN', 'ADD_DROP', 'SUMMER', 'RETAKE']),
    opensAt: z.string().trim().min(1, 'Укажите дату открытия.'),
    closesAt: z.string().trim().min(1, 'Укажите дату закрытия.'),
    minCredits: z.coerce.number().int().min(0).max(120).optional(),
    maxCredits: z.coerce.number().int().min(1).max(120).optional(),
  })
  .refine((v) => new Date(v.closesAt) > new Date(v.opensAt), {
    message: 'Дата закрытия должна быть позже даты открытия.',
  })
  .refine((v) => v.minCredits == null || v.maxCredits == null || v.minCredits <= v.maxCredits, {
    message: 'Минимум кредитов не может превышать максимум.',
  });

export type SaveWindowInput = z.input<typeof windowSchema>;

export async function saveRegistrationWindow(input: SaveWindowInput): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = windowSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { periodId, kind, opensAt, closesAt, minCredits, maxCredits } = parsed.data;

  const data = {
    opensAt: new Date(opensAt),
    closesAt: new Date(closesAt),
    minCredits: minCredits ?? null,
    maxCredits: maxCredits ?? null,
  };

  await prisma.registrationWindow.upsert({
    where: { periodId_kind: { periodId, kind } },
    create: { periodId, kind, ...data },
    update: data,
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PERIOD_WINDOW_UPDATE,
    entityType: 'RegistrationWindow',
    entityId: `${periodId}:${kind}`,
    newValue: parsed.data,
  });

  revalidate();
  return { ok: true };
}

export async function deleteRegistrationWindow(
  periodId: string,
  kind: 'MAIN' | 'ADD_DROP' | 'SUMMER' | 'RETAKE'
): Promise<Result> {
  const actor = await requirePermission('period:manage');
  await prisma.registrationWindow.deleteMany({ where: { periodId, kind } });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PERIOD_WINDOW_UPDATE,
    entityType: 'RegistrationWindow',
    entityId: `${periodId}:${kind}`,
    oldValue: { kind, deleted: true },
  });

  revalidate();
  return { ok: true };
}

// ── График учебного процесса (F-ACAD-02) ────────────────────────────────────

const eventSchema = z
  .object({
    id: z.string().trim().optional(),
    periodId: z.string().trim().min(1),
    kind: z.enum([
      'THEORY',
      'EXAM_SESSION',
      'PRACTICE',
      'VACATION',
      'FINAL_CERT',
      'SUMMER_TERM',
      'HOLIDAY',
    ]),
    courseNo: z.coerce.number().int().min(1).max(6).optional(),
    startDate: z.string().trim().min(1, 'Укажите дату начала.'),
    endDate: z.string().trim().min(1, 'Укажите дату окончания.'),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => new Date(v.endDate) >= new Date(v.startDate), {
    message: 'Дата окончания не может быть раньше даты начала.',
  });

export type SaveCalendarEventInput = z.input<typeof eventSchema>;

export async function saveCalendarEvent(input: SaveCalendarEventInput): Promise<Result> {
  await requirePermission('period:manage');
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, periodId, startDate, endDate, courseNo, ...rest } = parsed.data;

  const data = {
    periodId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    courseNo: courseNo ?? null,
    ...rest,
  };

  if (id) await prisma.calendarEvent.update({ where: { id }, data });
  else await prisma.calendarEvent.create({ data });

  revalidate();
  return { ok: true };
}

export async function deleteCalendarEvent(id: string): Promise<Result> {
  await requirePermission('period:manage');
  await prisma.calendarEvent.delete({ where: { id } });
  revalidate();
  return { ok: true };
}
