/**
 * Диплом с отличием и переводной балл — раздел 4.7 ТЗ,
 * требования F-ASM-07, F-ASM-09, правило R-18.
 *
 * Модуль чистый: никаких обращений к БД. Проверка на диплом с отличием
 * должна давать одинаковый ответ в отчёте офиса Регистратора, в карточке
 * обучающегося и в тестах.
 */

/**
 * Буквенные оценки, допустимые для диплома с отличием.
 *
 * Список задан Типовыми правилами (п. 50) буквально и не выводится из
 * порога цифрового эквивалента: C имеет 2,00, C+ — 2,33, и норма отделяет
 * их друг от друга. Поэтому здесь перечень, а не сравнение чисел.
 */
export const HONOURS_ALLOWED_LETTERS = ['A', 'A-', 'B+', 'B', 'B-', 'C+'] as const;

/** Минимальный GPA для диплома с отличием (Типовые правила, п. 50) */
export const HONOURS_MIN_GPA = 3.5;

/** Оценки итоговой аттестации, допустимые для диплома с отличием */
export const HONOURS_FINAL_LETTERS = ['A', 'A-'] as const;

export interface HonoursGradeEntry {
  disciplineId: string;
  disciplineName: string;
  letter: string | null;
  /** Цикл позиции плана: ДВО и ИА в проверку оценок не входят */
  cycle: 'OOD' | 'BD' | 'PD' | 'IA' | 'DVO';
  /** Номер попытки: пересдача или повторное изучение — это > 1 */
  attemptNo: number;
  /** Число пересдач итогового контроля по FX */
  retakeCount: number;
}

export interface HonoursInput {
  gpa: number | null;
  entries: HonoursGradeEntry[];
  /** Буквенная оценка итоговой аттестации; null — ИА ещё не сдана */
  finalAttestationLetter: string | null;
}

export interface HonoursCondition {
  /** Номер условия по п. 50 Типовых правил */
  no: 1 | 2 | 3 | 4;
  label: string;
  met: boolean;
  /** Что именно мешает — показывается офису Регистратора */
  detail: string;
}

export interface HonoursResult {
  eligible: boolean;
  conditions: HonoursCondition[];
  /** Дисциплины, оценки по которым не проходят условие 1 */
  blockingDisciplines: { disciplineName: string; letter: string | null }[];
}

/**
 * F-ASM-09, R-18. Проверка на диплом с отличием.
 *
 * Четыре условия п. 50 Типовых правил должны выполняться одновременно.
 * Возвращается не «да/нет», а разбор по каждому условию: обучающемуся и
 * офису Регистратора нужно знать, что именно не выполнено.
 */
export function checkHonours(input: HonoursInput): HonoursResult {
  const allowed = new Set<string>(HONOURS_ALLOWED_LETTERS);

  // Условие 1: все дисциплины и виды работы, кроме ДВО и итоговой аттестации
  const graded = input.entries.filter((e) => e.cycle !== 'DVO' && e.cycle !== 'IA');
  const blocking = graded.filter((e) => !e.letter || !allowed.has(e.letter));

  // Условие 4: за весь период обучения не было пересдач и повторных сдач.
  // Учитываются и повторные регистрации (attemptNo > 1), и пересдачи
  // итогового контроля по FX (retakeCount > 0) — норма говорит об обоих
  const retaken = input.entries.filter((e) => e.attemptNo > 1 || e.retakeCount > 0);

  const conditions: HonoursCondition[] = [
    {
      no: 1,
      label: `Оценки по всем дисциплинам — только ${HONOURS_ALLOWED_LETTERS.join(', ')}`,
      met: graded.length > 0 && blocking.length === 0,
      detail:
        graded.length === 0
          ? 'Нет итоговых оценок для проверки'
          : blocking.length === 0
            ? `Проверено дисциплин: ${graded.length}`
            : `Не проходят ${blocking.length}: ` +
              blocking
                .slice(0, 5)
                .map((b) => `${b.disciplineName} (${b.letter ?? 'нет оценки'})`)
                .join(', ') +
              (blocking.length > 5 ? ' и другие' : ''),
    },
    {
      no: 2,
      label: `GPA не ниже ${HONOURS_MIN_GPA.toFixed(1)}`,
      met: input.gpa != null && input.gpa >= HONOURS_MIN_GPA,
      detail:
        input.gpa == null
          ? 'GPA не рассчитан'
          : `Накопительный GPA — ${input.gpa.toFixed(2)}`,
    },
    {
      no: 3,
      label: `Итоговая аттестация сдана на ${HONOURS_FINAL_LETTERS.join(' или ')}`,
      met:
        input.finalAttestationLetter != null &&
        (HONOURS_FINAL_LETTERS as readonly string[]).includes(input.finalAttestationLetter),
      detail:
        input.finalAttestationLetter == null
          ? 'Итоговая аттестация не сдана'
          : `Оценка итоговой аттестации — ${input.finalAttestationLetter}`,
    },
    {
      no: 4,
      label: 'Не было пересдач и повторных сдач итогового контроля',
      met: retaken.length === 0,
      detail:
        retaken.length === 0
          ? 'Пересдач не зафиксировано'
          : `Пересдачи по ${retaken.length}: ` +
            retaken
              .slice(0, 5)
              .map((r) => r.disciplineName)
              .join(', ') +
            (retaken.length > 5 ? ' и другим' : ''),
    },
  ];

  return {
    eligible: conditions.every((c) => c.met),
    conditions,
    blockingDisciplines: blocking.map((b) => ({
      disciplineName: b.disciplineName,
      letter: b.letter,
    })),
  };
}

export interface PromotionInput {
  gpa: number | null;
  /** Порог перевода на следующий курс — настройка вуза (F-ASM-07) */
  threshold: number;
  studyYear: number;
  /** Кредиты, освоенные за учебный год */
  creditsEarned: number;
  /** Кредиты, заявленные в ИУП на год */
  creditsPlanned: number;
}

export interface PromotionResult {
  /** Переводится ли обучающийся на следующий курс */
  promoted: boolean;
  nextStudyYear: number;
  gpaMet: boolean;
  /** Кредиты, не набранные до заявленных в ИУП */
  creditsShortfall: number;
  reason: string;
}

/**
 * F-ASM-07. Переводной балл: проходит ли обучающийся на следующий курс.
 *
 * Порог — настройка вуза: Типовые правила устанавливают, что вуз определяет
 * переводной балл самостоятельно. Недобор кредитов сам по себе перевод
 * не запрещает — задолженность ликвидируется в летнем семестре, — но
 * показывается офису Регистратора вместе с решением.
 */
export function checkPromotion(input: PromotionInput): PromotionResult {
  const gpaMet = input.gpa != null && input.gpa >= input.threshold;
  const shortfall = Math.max(0, Math.round((input.creditsPlanned - input.creditsEarned) * 100) / 100);

  return {
    promoted: gpaMet,
    nextStudyYear: gpaMet ? input.studyYear + 1 : input.studyYear,
    gpaMet,
    creditsShortfall: shortfall,
    reason:
      input.gpa == null
        ? 'GPA за год не рассчитан'
        : gpaMet
          ? shortfall > 0
            ? `GPA ${input.gpa.toFixed(2)} не ниже переводного балла ${input.threshold.toFixed(2)}; ` +
              `задолженность ${shortfall} кредитов ликвидируется в летнем семестре`
            : `GPA ${input.gpa.toFixed(2)} не ниже переводного балла ${input.threshold.toFixed(2)}`
          : `GPA ${input.gpa.toFixed(2)} ниже переводного балла ${input.threshold.toFixed(2)}`,
  };
}

/**
 * F-ASM-10. Кредиты, зачтённые при переводе, восстановлении и мобильности,
 * входят в накопительный итог наравне с освоенными в вузе.
 *
 * В GPA перезачтённая дисциплина попадает только если у неё есть цифровой
 * эквивалент: транскрипты сторонних организаций не всегда его содержат,
 * и подставлять ноль вместо отсутствующей оценки нельзя — это занизило бы GPA.
 */
export function summarizeTransfers(
  transfers: { credits: number; gpaPoint: number | null; approved: boolean }[]
): { creditsApproved: number; creditsInGpa: number; weightedPoints: number } {
  const approved = transfers.filter((t) => t.approved);
  const withPoints = approved.filter((t) => t.gpaPoint != null);
  return {
    creditsApproved: round2(approved.reduce((a, t) => a + t.credits, 0)),
    creditsInGpa: round2(withPoints.reduce((a, t) => a + t.credits, 0)),
    weightedPoints: round2(withPoints.reduce((a, t) => a + t.credits * (t.gpaPoint ?? 0), 0)),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
