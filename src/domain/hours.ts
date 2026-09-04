/**
 * Учёт плановой трудоёмкости — раздел 4.2 ТЗ.
 *
 * Ключевое правило публикации курса:
 *     Σ planned_academic_hours (все ContentItem курса) = credits × 30
 *
 * Курс, не прошедший проверку, не публикуется (критерий приёмки № 2).
 */

import { HOURS_PER_CREDIT, DEFAULT_ACADEMIC_HOUR_MINUTES } from './constants';

export type WorkTypeCode = 'LECTURE' | 'PRACTICE' | 'LAB' | 'SROP' | 'SRO';

export interface HourBearingItem {
  id: string;
  plannedAcademicHours: number;
  workType: WorkTypeCode;
}

export interface WorkTypeNormSpec {
  workType: WorkTypeCode;
  sharePercent: number;
  tolerance: number;
}

export interface WorkTypeBreakdown {
  workType: WorkTypeCode;
  hours: number;
  percent: number;
}

export interface HoursValidationIssue {
  code:
    | 'TOTAL_MISMATCH'
    | 'NO_ITEMS'
    | 'ZERO_HOURS_ITEM'
    | 'WORK_TYPE_NORM_VIOLATION'
    | 'NEGATIVE_HOURS';
  message: string;
  /** Величина расхождения в академических часах (критерий приёмки № 2) */
  delta?: number;
  workType?: WorkTypeCode;
  itemIds?: string[];
}

export interface HoursValidationResult {
  valid: boolean;
  /** Сумма плановых часов по всем элементам содержания */
  plannedHours: number;
  /** Требуемый объём: credits × 30 */
  requiredHours: number;
  /** plannedHours − requiredHours; отрицательное — не хватает */
  delta: number;
  credits: number;
  tolerance: number;
  breakdown: WorkTypeBreakdown[];
  issues: HoursValidationIssue[];
}

/** Округление до 2 знаков — часы хранятся как Decimal(6,2) */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Требуемый объём часов для дисциплины: credits × 30 */
export function requiredHoursForCredits(credits: number): number {
  return credits * HOURS_PER_CREDIT;
}

/** Распределение плановых часов по видам учебной работы */
export function breakdownByWorkType(items: HourBearingItem[]): WorkTypeBreakdown[] {
  const total = items.reduce((sum, i) => sum + i.plannedAcademicHours, 0);
  const map = new Map<WorkTypeCode, number>();
  for (const item of items) {
    map.set(item.workType, round2((map.get(item.workType) ?? 0) + item.plannedAcademicHours));
  }
  return [...map.entries()]
    .map(([workType, hours]) => ({
      workType,
      hours,
      percent: total > 0 ? round2((hours / total) * 100) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Проверка соответствия курса объёму дисциплины в кредитах.
 *
 * @param items    элементы содержания курса
 * @param credits  объём дисциплины в академических кредитах
 * @param options  допуск отклонения и (опционально) нормативы по видам работы
 */
export function validateCourseHours(
  items: HourBearingItem[],
  credits: number,
  options: { tolerance?: number; norms?: WorkTypeNormSpec[]; enforceNorms?: boolean } = {}
): HoursValidationResult {
  const tolerance = options.tolerance ?? 0;
  const requiredHours = requiredHoursForCredits(credits);
  const plannedHours = round2(items.reduce((sum, i) => sum + i.plannedAcademicHours, 0));
  const delta = round2(plannedHours - requiredHours);
  const breakdown = breakdownByWorkType(items);
  const issues: HoursValidationIssue[] = [];

  if (items.length === 0) {
    issues.push({
      code: 'NO_ITEMS',
      message: 'Курс не содержит ни одного элемента содержания.',
    });
  }

  const negative = items.filter((i) => i.plannedAcademicHours < 0);
  if (negative.length > 0) {
    issues.push({
      code: 'NEGATIVE_HOURS',
      message: 'Плановая трудоёмкость не может быть отрицательной.',
      itemIds: negative.map((i) => i.id),
    });
  }

  const zero = items.filter((i) => i.plannedAcademicHours === 0);
  if (zero.length > 0) {
    issues.push({
      code: 'ZERO_HOURS_ITEM',
      message: `Элементов с нулевой трудоёмкостью: ${zero.length}. Укажите плановые часы для каждого элемента.`,
      itemIds: zero.map((i) => i.id),
    });
  }

  if (Math.abs(delta) > tolerance) {
    const verb = delta > 0 ? 'превышает' : 'меньше';
    issues.push({
      code: 'TOTAL_MISMATCH',
      message:
        `Сумма плановых часов (${plannedHours}) ${verb} требуемый объём ` +
        `(${requiredHours} = ${credits} кр. × ${HOURS_PER_CREDIT} ч) на ${Math.abs(delta)} ч.`,
      delta,
    });
  }

  if (options.enforceNorms && options.norms?.length) {
    for (const norm of options.norms) {
      const actual = breakdown.find((b) => b.workType === norm.workType)?.percent ?? 0;
      const diff = round2(actual - norm.sharePercent);
      if (Math.abs(diff) > norm.tolerance) {
        issues.push({
          code: 'WORK_TYPE_NORM_VIOLATION',
          message:
            `${workTypeLabel(norm.workType)}: фактически ${actual} %, ` +
            `норматив ${norm.sharePercent} % (допуск ±${norm.tolerance} п.п.).`,
          workType: norm.workType,
          delta: diff,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    plannedHours,
    requiredHours,
    delta,
    credits,
    tolerance,
    breakdown,
    issues,
  };
}

/**
 * Текст индикатора конструктора курса (F-T-07):
 * «Распределено 78 из 90 академических часов (3 кредита)».
 */
export function hoursIndicatorText(plannedHours: number, credits: number): string {
  const required = requiredHoursForCredits(credits);
  return `Распределено ${round2(plannedHours)} из ${required} академических часов (${credits} ${creditWord(credits)})`;
}

function creditWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'кредитов';
  if (mod10 === 1) return 'кредит';
  if (mod10 >= 2 && mod10 <= 4) return 'кредита';
  return 'кредитов';
}

export function workTypeLabel(t: WorkTypeCode): string {
  const map: Record<WorkTypeCode, string> = {
    LECTURE: 'Лекция',
    PRACTICE: 'Практическое занятие',
    LAB: 'Лабораторное занятие',
    SROP: 'СРОП',
    SRO: 'СРО',
  };
  return map[t];
}

/** Академические часы → минуты */
export function academicHoursToMinutes(
  hours: number,
  minutesPerHour: number = DEFAULT_ACADEMIC_HOUR_MINUTES
): number {
  return round2(hours * minutesPerHour);
}

/** Минуты → академические часы */
export function minutesToAcademicHours(
  minutes: number,
  minutesPerHour: number = DEFAULT_ACADEMIC_HOUR_MINUTES
): number {
  return round2(minutes / minutesPerHour);
}
