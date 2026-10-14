import type { GradeComponent } from '@/db/schema';
import { round1 } from './deadlines';

export type Scheme = {
  currentWeight: number;
  admissionThreshold: number;
  rkMinScore: number;
};

export type ComponentScores = Record<GradeComponent, number | null>;

/**
 * Балл компонента — среднее по его элементам (например, несколько заданий в ТК1).
 * Элемент без оценки считается нулём, только если по компоненту есть хотя бы одна оценка;
 * иначе компонент пустой (null) — в журнале это «—».
 */
export function componentScores(
  items: { id: string; component: GradeComponent }[],
  scores: Map<string, number>,
): ComponentScores {
  const out: ComponentScores = { TK1: null, RK1: null, TK2: null, RK2: null, EXAM: null };
  for (const c of Object.keys(out) as GradeComponent[]) {
    const list = items.filter((i) => i.component === c);
    if (list.length === 0) continue;
    const vals = list.map((i) => scores.get(i.id));
    if (vals.every((v) => v === undefined)) continue;
    out[c] = round1(vals.reduce<number>((s, v) => s + (v ?? 0), 0) / list.length);
  }
  return out;
}

/**
 * Рейтинг допуска: R1 = ТК1·w + РК1·(1−w), R2 = ТК2·w + РК2·(1−w), РД = (R1 + R2) / 2.
 * Итоговую оценку с экзаменом считает Platonus — LMS отдаёт только компоненты.
 */
export function admissionRating(s: ComponentScores, scheme: Scheme) {
  const w = Math.min(1, Math.max(0, scheme.currentWeight));
  const r1 = round1((s.TK1 ?? 0) * w + (s.RK1 ?? 0) * (1 - w));
  const r2 = round1((s.TK2 ?? 0) * w + (s.RK2 ?? 0) * (1 - w));
  const rating = round1((r1 + r2) / 2);
  const rkOk = scheme.rkMinScore <= 0 || ((s.RK1 ?? 0) >= scheme.rkMinScore && (s.RK2 ?? 0) >= scheme.rkMinScore);
  return { r1, r2, rating, admitted: rating >= scheme.admissionThreshold && rkOk };
}
