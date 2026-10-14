import type { QuestionType } from '@/db/schema';

export type QOption = { id: string; text: string; isCorrect: boolean; position: number; matchText: string | null };
export type QQuestion = { id: string; type: QuestionType; difficulty: number; data: { answers?: string[] }; options: QOption[] };

export type Answer =
  | { option?: string }
  | { options?: string[] }
  | { pairs?: Record<string, string> }
  | { order?: string[] }
  | { text?: string };

export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/[.,;:!?"'«»]+$/g, '')
    .trim();

/** Доля верного ответа 0…1 */
export function scoreAnswer(q: QQuestion, raw: unknown): number {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case 'single': {
      const opt = q.options.find((o) => o.id === a.option);
      return opt?.isCorrect ? 1 : 0;
    }
    case 'multiple': {
      const chosen = new Set(Array.isArray(a.options) ? (a.options as string[]) : []);
      const correct = q.options.filter((o) => o.isCorrect);
      if (correct.length === 0) return 0;
      const right = correct.filter((o) => chosen.has(o.id)).length;
      const wrong = q.options.filter((o) => !o.isCorrect && chosen.has(o.id)).length;
      return Math.max(0, (right - wrong) / correct.length);
    }
    case 'matching': {
      const pairs = (a.pairs ?? {}) as Record<string, string>;
      const items = q.options.filter((o) => o.matchText);
      if (items.length === 0) return 0;
      return items.filter((o) => pairs[o.id] === o.id).length / items.length;
    }
    case 'ordering': {
      const order = Array.isArray(a.order) ? (a.order as string[]) : [];
      const correct = [...q.options].sort((x, y) => x.position - y.position).map((o) => o.id);
      if (correct.length === 0) return 0;
      return correct.filter((id, i) => order[i] === id).length / correct.length;
    }
    case 'short': {
      const text = typeof a.text === 'string' ? normalizeText(a.text) : '';
      if (!text) return 0;
      const accepted = [...(q.data.answers ?? []), ...q.options.filter((o) => o.isCorrect).map((o) => o.text)].map(normalizeText);
      return accepted.includes(text) ? 1 : 0;
    }
  }
}

/** Итог попытки в баллах 0–100 */
export function attemptScore(credits: number[]) {
  if (credits.length === 0) return 0;
  return Math.round((credits.reduce((s, c) => s + c, 0) / credits.length) * 1000) / 10;
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Выбор вопросов по сложности: сколько лёгких, средних и сложных.
 * Если вопросов какой-то сложности не хватает — берём сколько есть.
 */
export function pickQuestions<T extends { difficulty: number }>(
  pool: T[],
  counts: { easy: number; medium: number; hard: number },
  rnd: () => number = Math.random,
): T[] {
  const by = (d: number) => shuffle(pool.filter((q) => q.difficulty === d), rnd);
  return [...by(1).slice(0, counts.easy), ...by(2).slice(0, counts.medium), ...by(3).slice(0, counts.hard)];
}

/** Порядок вариантов для попытки: «порядок» всегда перемешивается, остальное — по настройке */
export function optionOrder(q: QQuestion, doShuffle: boolean, rnd: () => number = Math.random): string[] {
  const ids = [...q.options].sort((x, y) => x.position - y.position).map((o) => o.id);
  if (q.type === 'ordering') {
    let s = shuffle(ids, rnd);
    for (let i = 0; i < 5 && ids.length > 1 && s.every((id, k) => id === ids[k]); i++) s = shuffle(ids, rnd);
    return s;
  }
  return doShuffle ? shuffle(ids, rnd) : ids;
}
