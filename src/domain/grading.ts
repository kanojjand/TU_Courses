/**
 * Расчёт оценок — раздел 4.3 ТЗ.
 *
 * Формула по умолчанию:
 *     Рейтинг допуска = (РК1 + РК2) / 2
 *     Итоговый балл   = Рейтинг допуска × 0,6 + Экзамен × 0,4
 *
 * Все коэффициенты и пороги — настраиваемые (GradeConfig: вуз → дисциплина → курс).
 * Буквенная шкала — Приложение 1 к Типовым правилам (Приказ № 595), раздел 2.3.
 */

import { round2 } from './hours';

export type ControlPeriodCode = 'RK1' | 'RK2' | 'EXAM';

export interface GradeConfigSpec {
  midtermCount: number;
  admissionWeight: number;
  examWeight: number;
  admissionThreshold: number;
  passingScore: number;
  examMinScore: number;
}

export const DEFAULT_GRADE_CONFIG: GradeConfigSpec = {
  midtermCount: 2,
  admissionWeight: 0.6,
  examWeight: 0.4,
  admissionThreshold: 50,
  passingScore: 50,
  examMinScore: 0,
};

export interface GradeScaleRow {
  letter: string;
  gpaPoints: number;
  minPercent: number;
  maxPercent: number;
  traditionalKk: string;
  traditionalRu: string;
  traditionalEn: string;
  ects?: string | null;
  cefr?: string | null;
  isPassing: boolean;
}

/**
 * Шкала оценивания — Приложение 1 к Типовым правилам деятельности ОВПО.
 * Справочник неизменяем (раздел 2.3 ТЗ); здесь продублирован как источник сида
 * и как резерв на случай недоступности БД при расчёте.
 */
export const STANDARD_GRADE_SCALE: GradeScaleRow[] = [
  { letter: 'A',  gpaPoints: 4.0,  minPercent: 95, maxPercent: 100, traditionalKk: 'Өте жақсы',        traditionalRu: 'Отлично',              traditionalEn: 'Excellent',    ects: 'A',  isPassing: true },
  { letter: 'A−', gpaPoints: 3.67, minPercent: 90, maxPercent: 94,  traditionalKk: 'Өте жақсы',        traditionalRu: 'Отлично',              traditionalEn: 'Excellent',    ects: 'A−', isPassing: true },
  { letter: 'B+', gpaPoints: 3.33, minPercent: 85, maxPercent: 89,  traditionalKk: 'Жақсы',            traditionalRu: 'Хорошо',               traditionalEn: 'Good',         ects: 'B+', isPassing: true },
  { letter: 'B',  gpaPoints: 3.0,  minPercent: 80, maxPercent: 84,  traditionalKk: 'Жақсы',            traditionalRu: 'Хорошо',               traditionalEn: 'Good',         ects: 'B',  isPassing: true },
  { letter: 'B−', gpaPoints: 2.67, minPercent: 75, maxPercent: 79,  traditionalKk: 'Жақсы',            traditionalRu: 'Хорошо',               traditionalEn: 'Good',         ects: 'B−', isPassing: true },
  { letter: 'C+', gpaPoints: 2.33, minPercent: 70, maxPercent: 74,  traditionalKk: 'Қанағаттанарлық',  traditionalRu: 'Удовлетворительно',    traditionalEn: 'Satisfactory', ects: 'C+', isPassing: true },
  { letter: 'C',  gpaPoints: 2.0,  minPercent: 65, maxPercent: 69,  traditionalKk: 'Қанағаттанарлық',  traditionalRu: 'Удовлетворительно',    traditionalEn: 'Satisfactory', ects: 'C',  isPassing: true },
  { letter: 'C−', gpaPoints: 1.67, minPercent: 60, maxPercent: 64,  traditionalKk: 'Қанағаттанарлық',  traditionalRu: 'Удовлетворительно',    traditionalEn: 'Satisfactory', ects: 'C−', isPassing: true },
  { letter: 'D+', gpaPoints: 1.33, minPercent: 55, maxPercent: 59,  traditionalKk: 'Қанағаттанарлық',  traditionalRu: 'Удовлетворительно',    traditionalEn: 'Satisfactory', ects: 'D+', isPassing: true },
  { letter: 'D',  gpaPoints: 1.0,  minPercent: 50, maxPercent: 54,  traditionalKk: 'Қанағаттанарлық',  traditionalRu: 'Удовлетворительно',    traditionalEn: 'Satisfactory', ects: 'D',  isPassing: true },
  { letter: 'FX', gpaPoints: 0.5,  minPercent: 25, maxPercent: 49,  traditionalKk: 'Қанағаттанарлықсыз', traditionalRu: 'Неудовлетворительно', traditionalEn: 'Fail',        ects: 'FX', isPassing: false },
  { letter: 'F',  gpaPoints: 0.0,  minPercent: 0,  maxPercent: 24,  traditionalKk: 'Қанағаттанарлықсыз', traditionalRu: 'Неудовлетворительно', traditionalEn: 'Fail',        ects: 'F',  isPassing: false },
];

/**
 * Шкала Приложения 2 — языковые дисциплины с привязкой к уровням ОЕК (A1–C2).
 * Применение на этапе 1 — открытый вопрос 14.2.6 ТЗ; профиль назначается дисциплине.
 */
export const LANGUAGE_GRADE_SCALE: GradeScaleRow[] = STANDARD_GRADE_SCALE.map((row) => ({
  ...row,
  cefr: cefrForPercent(row.minPercent),
}));

function cefrForPercent(p: number): string | null {
  if (p >= 95) return 'C2';
  if (p >= 85) return 'C1';
  if (p >= 75) return 'B2';
  if (p >= 65) return 'B1';
  if (p >= 55) return 'A2';
  if (p >= 50) return 'A1';
  return null;
}

/** Буквенная оценка по проценту (Приложение 1) */
export function letterForScore(
  percent: number,
  scale: GradeScaleRow[] = STANDARD_GRADE_SCALE
): GradeScaleRow {
  const p = Math.max(0, Math.min(100, percent));
  const rounded = Math.round(p);
  const found = scale.find((row) => rounded >= row.minPercent && rounded <= row.maxPercent);
  // Нижняя строка шкалы (F) — гарантированный результат для любого значения
  return found ?? scale[scale.length - 1];
}

export interface MidtermInput {
  /** Баллы рубежных контролей, по одному на период; null — не выставлен */
  midterms: (number | null)[];
  examScore: number | null;
  config?: Partial<GradeConfigSpec>;
  scale?: GradeScaleRow[];
}

export interface FinalGradeResult {
  midterms: (number | null)[];
  /** Рейтинг допуска = среднее по рубежным контролям */
  admissionScore: number | null;
  isAdmitted: boolean;
  examScore: number | null;
  finalScore: number | null;
  letter: string | null;
  gpaPoints: number | null;
  traditionalRu: string | null;
  ects: string | null;
  cefr: string | null;
  isPassing: boolean;
  /** FX даёт право на пересдачу экзамена без повторного изучения дисциплины */
  canRetakeExam: boolean;
  /** Человекочитаемое пояснение — показывается в журнале */
  explanation: string;
}

/**
 * Расчёт итоговой оценки по курсу.
 *
 * Правила (раздел 4.3):
 *  — допуск к экзамену при рейтинге допуска не ниже порога (по умолчанию 50);
 *  — при итоговом балле ниже 50 выставляется FX или F;
 *  — FX даёт право на повторную сдачу экзамена, F — не даёт.
 */
export function calculateFinalGrade(input: MidtermInput): FinalGradeResult {
  const cfg: GradeConfigSpec = { ...DEFAULT_GRADE_CONFIG, ...input.config };
  const scale = input.scale ?? STANDARD_GRADE_SCALE;

  const present = input.midterms.filter((m): m is number => m !== null && !Number.isNaN(m));
  const admissionScore =
    present.length > 0 ? round2(present.reduce((a, b) => a + b, 0) / present.length) : null;

  const isAdmitted = admissionScore !== null && admissionScore >= cfg.admissionThreshold;

  const empty: FinalGradeResult = {
    midterms: input.midterms,
    admissionScore,
    isAdmitted,
    examScore: input.examScore,
    finalScore: null,
    letter: null,
    gpaPoints: null,
    traditionalRu: null,
    ects: null,
    cefr: null,
    isPassing: false,
    canRetakeExam: false,
    explanation: '',
  };

  // Рубежные контроли не выставлены — итог не рассчитывается
  if (admissionScore === null) {
    return { ...empty, explanation: 'Рубежный контроль не выставлен — итог не рассчитывается.' };
  }

  // Не допущен: итог — F независимо от экзамена
  if (!isAdmitted) {
    const f = scale[scale.length - 1];
    return {
      ...empty,
      finalScore: round2(admissionScore * cfg.admissionWeight),
      letter: f.letter,
      gpaPoints: f.gpaPoints,
      traditionalRu: f.traditionalRu,
      ects: f.ects ?? null,
      cefr: f.cefr ?? null,
      isPassing: false,
      canRetakeExam: false,
      explanation:
        `Рейтинг допуска ${admissionScore} ниже порога ${cfg.admissionThreshold} — ` +
        `студент не допущен к экзамену, выставляется ${f.letter}.`,
    };
  }

  // Допущен, но экзамен не сдан (не выставлен балл)
  if (input.examScore === null || Number.isNaN(input.examScore)) {
    return {
      ...empty,
      explanation: `Допущен к экзамену (рейтинг допуска ${admissionScore}). Экзамен не выставлен.`,
    };
  }

  const finalScore = round2(
    admissionScore * cfg.admissionWeight + input.examScore * cfg.examWeight
  );

  // Отдельный минимальный порог по экзамену, если установлен академической политикой
  const failedExamMin = cfg.examMinScore > 0 && input.examScore < cfg.examMinScore;

  const row =
    failedExamMin || finalScore < cfg.passingScore
      ? letterForScore(failedExamMin ? Math.min(finalScore, 49) : finalScore, scale)
      : letterForScore(finalScore, scale);

  const canRetakeExam = row.letter === 'FX';

  const explanation =
    `Рейтинг допуска ${admissionScore} × ${cfg.admissionWeight} + ` +
    `экзамен ${input.examScore} × ${cfg.examWeight} = ${finalScore} → ${row.letter} (${row.gpaPoints.toFixed(2)})` +
    (failedExamMin ? `. Балл экзамена ниже минимального (${cfg.examMinScore}).` : '') +
    (canRetakeExam ? '. FX — допускается повторная сдача экзамена без повторного изучения дисциплины.' : '') +
    (row.letter === 'F' ? '. F — требуется повторное изучение дисциплины.' : '');

  return {
    midterms: input.midterms,
    admissionScore,
    isAdmitted: true,
    examScore: input.examScore,
    finalScore,
    letter: row.letter,
    gpaPoints: row.gpaPoints,
    traditionalRu: row.traditionalRu,
    ects: row.ects ?? null,
    cefr: row.cefr ?? null,
    isPassing: row.isPassing,
    canRetakeExam,
    explanation,
  };
}

export interface GradeItemScore {
  /** Полученный балл */
  score: number;
  /** Максимальный балл мероприятия */
  maxScore: number;
  /** Вес мероприятия внутри периода контроля, % */
  weight: number;
}

/**
 * Балл за период контроля (РК1 / РК2) как взвешенное среднее оценочных
 * мероприятий периода, приведённое к 100-балльной шкале.
 *
 * Если сумма весов ≠ 100, выполняется нормировка по фактической сумме весов —
 * это позволяет корректно считать промежуточный результат, когда часть
 * мероприятий периода ещё не проведена.
 */
export function calculateControlPeriodScore(items: GradeItemScore[]): number | null {
  const usable = items.filter((i) => i.maxScore > 0 && i.weight > 0);
  if (usable.length === 0) return null;
  const totalWeight = usable.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) return null;
  const weighted = usable.reduce((s, i) => s + (i.score / i.maxScore) * 100 * i.weight, 0);
  return round2(weighted / totalWeight);
}

/** Снижение балла за просрочку сдачи задания (F-T-10) */
export function applyLatePenalty(
  rawScore: number,
  daysLate: number,
  penaltyPerDay: number,
  penaltyMax: number
): { score: number; penaltyPercent: number } {
  if (daysLate <= 0) return { score: round2(rawScore), penaltyPercent: 0 };
  const penaltyPercent = Math.min(daysLate * penaltyPerDay, penaltyMax);
  return {
    score: round2(rawScore * (1 - penaltyPercent / 100)),
    penaltyPercent: round2(penaltyPercent),
  };
}
