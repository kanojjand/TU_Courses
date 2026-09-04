/**
 * Автоматическая проверка тестов — F-S-07, F-T-09, критерий приёмки № 4.
 *
 * Типы вопросов этапа 1 (F-T-08):
 *  SINGLE_CHOICE, MULTI_CHOICE, MATCHING, ORDERING, SHORT_ANSWER, TRUE_FALSE
 */

import { round2 } from './hours';

export type QuestionTypeCode =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'MATCHING'
  | 'ORDERING'
  | 'SHORT_ANSWER'
  | 'TRUE_FALSE';

export interface OptionSpec {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
  /** MATCHING — правая часть пары; ORDERING — правильная позиция (число строкой) */
  matchKey?: string | null;
}

export interface QuestionSpec {
  id: string;
  type: QuestionTypeCode;
  points: number;
  options: OptionSpec[];
  /** SHORT_ANSWER: { answers: string[], caseSensitive?: boolean, trim?: boolean } */
  payload?: {
    answers?: string[];
    caseSensitive?: boolean;
    /** Частичный балл за частично верный ответ (MULTI_CHOICE, MATCHING, ORDERING) */
    partialCredit?: boolean;
  } | null;
}

/** Ответ студента */
export type AnswerResponse =
  | { optionIds: string[] }
  | { text: string }
  | { pairs: Record<string, string> } // optionId → выбранный matchKey
  | { order: string[] } // optionId в порядке, указанном студентом
  | null;

export interface GradedAnswer {
  questionId: string;
  isCorrect: boolean;
  points: number;
  maxPoints: number;
}

/** Проверка одного ответа */
export function gradeAnswer(question: QuestionSpec, response: AnswerResponse): GradedAnswer {
  const maxPoints = question.points;
  const zero: GradedAnswer = {
    questionId: question.id,
    isCorrect: false,
    points: 0,
    maxPoints,
  };
  if (!response) return zero;

  const partial = question.payload?.partialCredit ?? true;

  switch (question.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      if (!('optionIds' in response)) return zero;
      const chosen = response.optionIds;
      if (chosen.length !== 1) return zero;
      const correct = question.options.find((o) => o.isCorrect);
      const isCorrect = Boolean(correct && chosen[0] === correct.id);
      return { questionId: question.id, isCorrect, points: isCorrect ? maxPoints : 0, maxPoints };
    }

    case 'MULTI_CHOICE': {
      if (!('optionIds' in response)) return zero;
      const chosen = new Set(response.optionIds);
      const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
      const wrongIds = question.options.filter((o) => !o.isCorrect).map((o) => o.id);

      const hits = [...correctIds].filter((id) => chosen.has(id)).length;
      const falsePositives = wrongIds.filter((id) => chosen.has(id)).length;
      const isCorrect = hits === correctIds.size && falsePositives === 0;

      if (isCorrect) {
        return { questionId: question.id, isCorrect: true, points: maxPoints, maxPoints };
      }
      if (!partial || correctIds.size === 0) return zero;

      // Частичный балл: доля верных минус доля ложных, не ниже нуля
      const raw = hits / correctIds.size - falsePositives / Math.max(wrongIds.length, 1);
      const points = round2(Math.max(0, raw) * maxPoints);
      return { questionId: question.id, isCorrect: false, points, maxPoints };
    }

    case 'MATCHING': {
      if (!('pairs' in response)) return zero;
      const total = question.options.length;
      if (total === 0) return zero;
      let hits = 0;
      for (const opt of question.options) {
        if (response.pairs[opt.id] !== undefined && response.pairs[opt.id] === opt.matchKey) hits++;
      }
      const isCorrect = hits === total;
      if (isCorrect) return { questionId: question.id, isCorrect: true, points: maxPoints, maxPoints };
      if (!partial) return zero;
      return {
        questionId: question.id,
        isCorrect: false,
        points: round2((hits / total) * maxPoints),
        maxPoints,
      };
    }

    case 'ORDERING': {
      if (!('order' in response)) return zero;
      const expected = [...question.options]
        .sort((a, b) => Number(a.matchKey ?? a.orderIndex) - Number(b.matchKey ?? b.orderIndex))
        .map((o) => o.id);
      const given = response.order;
      if (given.length !== expected.length) return zero;
      let hits = 0;
      for (let i = 0; i < expected.length; i++) if (given[i] === expected[i]) hits++;
      const isCorrect = hits === expected.length;
      if (isCorrect) return { questionId: question.id, isCorrect: true, points: maxPoints, maxPoints };
      if (!partial) return zero;
      return {
        questionId: question.id,
        isCorrect: false,
        points: round2((hits / expected.length) * maxPoints),
        maxPoints,
      };
    }

    case 'SHORT_ANSWER': {
      if (!('text' in response)) return zero;
      const accepted = question.payload?.answers ?? [];
      const caseSensitive = question.payload?.caseSensitive ?? false;
      const normalize = (s: string) => {
        const t = s.trim().replace(/\s+/g, ' ');
        return caseSensitive ? t : t.toLocaleLowerCase('ru-RU');
      };
      const given = normalize(response.text);
      const isCorrect = accepted.some((a) => normalize(a) === given);
      return { questionId: question.id, isCorrect, points: isCorrect ? maxPoints : 0, maxPoints };
    }

    default:
      return zero;
  }
}

export interface AttemptGradeResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  answers: GradedAnswer[];
}

/** Проверка попытки целиком */
export function gradeAttempt(
  questions: QuestionSpec[],
  responses: Record<string, AnswerResponse>,
  passingScore = 50
): AttemptGradeResult {
  const answers = questions.map((q) => gradeAnswer(q, responses[q.id] ?? null));
  const score = round2(answers.reduce((s, a) => s + a.points, 0));
  const maxScore = round2(answers.reduce((s, a) => s + a.maxPoints, 0));
  const percent = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  return { score, maxScore, percent, passed: percent >= passingScore, answers };
}

export type QuizGradingMethodCode = 'HIGHEST' | 'LAST' | 'AVERAGE' | 'FIRST';

/** Итог по попыткам согласно выбранному методу подсчёта (F-T-09) */
export function resolveAttemptScore(
  attempts: { attemptNo: number; percent: number; score: number }[],
  method: QuizGradingMethodCode
): { percent: number; score: number } | null {
  if (attempts.length === 0) return null;
  const sorted = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);
  switch (method) {
    case 'HIGHEST':
      return sorted.reduce((best, a) => (a.percent > best.percent ? a : best), sorted[0]);
    case 'LAST':
      return sorted[sorted.length - 1];
    case 'FIRST':
      return sorted[0];
    case 'AVERAGE':
      return {
        percent: round2(sorted.reduce((s, a) => s + a.percent, 0) / sorted.length),
        score: round2(sorted.reduce((s, a) => s + a.score, 0) / sorted.length),
      };
  }
}

/**
 * Детерминированное перемешивание по идентификатору попытки.
 * Порядок сохраняется в QuizAttempt.questionOrder — при обрыве связи
 * студент возвращается к той же последовательности (F-S-07).
 */
export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return Math.abs(h) / 2147483647;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Оставшееся время попытки, секунд; null — без ограничения */
export function remainingSeconds(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

/** Статистика сложности вопроса (F-T-13) */
export function questionDifficultyStats(
  answers: { isCorrect: boolean }[]
): { total: number; correct: number; successRate: number; label: string } {
  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const successRate = total > 0 ? round2((correct / total) * 100) : 0;
  const label =
    total === 0 ? 'нет данных' : successRate >= 80 ? 'лёгкий' : successRate >= 40 ? 'средний' : 'сложный';
  return { total, correct, successRate, label };
}
