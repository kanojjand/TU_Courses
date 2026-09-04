/**
 * Расчёт GPA — раздел 4.3 ТЗ.
 *
 *     GPA = Σ (цифровой эквивалент × кредиты дисциплины) / Σ кредиты
 *
 * Рассчитывается за академический период, за учебный год и накопительным итогом.
 */

export interface GpaEntry {
  /** Цифровой эквивалент буквенной оценки (4.00 … 0.00) */
  gpaPoints: number;
  /** Объём дисциплины в академических кредитах */
  credits: number;
  /** Идентификатор периода — для группировки */
  periodId?: string;
  /** Идентификатор учебного года — для группировки */
  academicYearId?: string;
  /** Учитывать ли дисциплину в GPA (пересдачи, факультативы) */
  countsTowardGpa?: boolean;
}

export interface GpaResult {
  gpa: number;
  credits: number;
  /** Число дисциплин, вошедших в расчёт */
  count: number;
}

/** Округление GPA до 3 знаков — хранится как Decimal(4,3) */
function round3(v: number): number {
  return Math.round((v + Number.EPSILON) * 1000) / 1000;
}

/**
 * Средневзвешенное по кредитам.
 * Дисциплины с credits ≤ 0 и помеченные countsTowardGpa=false исключаются.
 */
export function calculateGpa(entries: GpaEntry[]): GpaResult {
  const usable = entries.filter((e) => e.credits > 0 && e.countsTowardGpa !== false);
  const totalCredits = usable.reduce((s, e) => s + e.credits, 0);
  if (totalCredits === 0) return { gpa: 0, credits: 0, count: 0 };
  const weighted = usable.reduce((s, e) => s + e.gpaPoints * e.credits, 0);
  return {
    gpa: round3(weighted / totalCredits),
    credits: totalCredits,
    count: usable.length,
  };
}

/** GPA за академический период */
export function calculatePeriodGpa(entries: GpaEntry[], periodId: string): GpaResult {
  return calculateGpa(entries.filter((e) => e.periodId === periodId));
}

/** GPA за учебный год */
export function calculateYearGpa(entries: GpaEntry[], academicYearId: string): GpaResult {
  return calculateGpa(entries.filter((e) => e.academicYearId === academicYearId));
}

/** Накопительный GPA за всё время обучения */
export function calculateCumulativeGpa(entries: GpaEntry[]): GpaResult {
  return calculateGpa(entries);
}

/**
 * Интегрированный социальный GPA — п. 40 Типовых правил.
 * Методику расчёта вуз определяет самостоятельно (открытый вопрос 14.2.7 ТЗ),
 * поэтому реализована настраиваемая линейная модель:
 *
 *     socialGPA = academicWeight × GPA + Σ (вес_компонента × нормированный_балл)
 *
 * Компоненты (научная, общественная, спортивная активность и т. п.) задаются
 * вузом; при отсутствии утверждённой методики функция не применяется.
 */
export interface SocialGpaComponent {
  code: string;
  /** Балл компонента */
  score: number;
  /** Максимальный балл компонента */
  maxScore: number;
  /** Вес компонента в итоговой величине (доля) */
  weight: number;
}

export function calculateSocialGpa(
  academicGpa: number,
  components: SocialGpaComponent[],
  academicWeight = 0.7
): number {
  const componentPart = components.reduce((sum, c) => {
    if (c.maxScore <= 0) return sum;
    const normalized = Math.max(0, Math.min(1, c.score / c.maxScore));
    return sum + normalized * 4 * c.weight;
  }, 0);
  return round3(academicGpa * academicWeight + componentPart);
}

/**
 * Пороговое значение GPA для перевода на следующий курс.
 * Устанавливается академической политикой вуза; здесь — только сравнение.
 */
export function meetsGpaThreshold(gpa: number, threshold: number): boolean {
  return gpa >= threshold;
}
