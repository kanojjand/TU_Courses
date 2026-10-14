/**
 * Правила «вовремя» (раздел 5.3 ТЗ).
 *
 * У каждого элемента оценивания окно: открыт с → срок сдачи → жёсткое закрытие.
 * До срока — обычная оценка; после срока, но до закрытия — «поздно» и правило
 * из схемы оценивания; после закрытия — только заявка, которую одобряет регистратор.
 */
export type GradeWindow = { opensAt: Date | null; dueAt: Date | null; hardCloseAt: Date | null };
export type Timing = 'not_open' | 'on_time' | 'late' | 'closed';

export function timingAt(w: GradeWindow, at: Date = new Date()): Timing {
  const t = at.getTime();
  if (w.opensAt && t < w.opensAt.getTime()) return 'not_open';
  if (w.hardCloseAt && t > w.hardCloseAt.getTime()) return 'closed';
  if (w.dueAt && t > w.dueAt.getTime()) return 'late';
  return 'on_time';
}

export type LatePolicy = { lateRule: 'none' | 'penalty' | 'zero'; latePenaltyPct: number };

/** Балл с учётом опоздания. Исходный балл хранится отдельно (raw_score). */
export function applyLateRule(raw: number, isLate: boolean, policy: LatePolicy): number {
  const score = clampScore(raw);
  if (!isLate) return score;
  if (policy.lateRule === 'zero') return 0;
  if (policy.lateRule === 'penalty') return round1(score * (1 - Math.min(100, Math.max(0, policy.latePenaltyPct)) / 100));
  return score;
}

export type EditDecision = 'ok' | 'needs_request';

/**
 * Может ли преподаватель сам поставить или изменить оценку.
 * Отправленные и подтверждённые Platonus оценки, а также всё после закрытия
 * окна, меняются только через заявку.
 */
export function teacherEditDecision(
  w: GradeWindow,
  grade: { status: 'draft' | 'final' | 'sent' | 'confirmed' } | null,
  now: Date = new Date(),
): EditDecision {
  if (grade && (grade.status === 'sent' || grade.status === 'confirmed')) return 'needs_request';
  if (w.hardCloseAt && now.getTime() > w.hardCloseAt.getTime()) return 'needs_request';
  return 'ok';
}

/** Сдача работы студентом: можно ли и с какой пометкой */
export function submissionDecision(w: GradeWindow, now: Date = new Date()): { allowed: boolean; late: boolean; timing: Timing } {
  const timing = timingAt(w, now);
  return { allowed: timing === 'on_time' || timing === 'late', late: timing === 'late', timing };
}

export function clampScore(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, round1(n)));
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}
