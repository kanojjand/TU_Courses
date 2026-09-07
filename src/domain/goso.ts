/**
 * Валидатор ГОСО — раздел 2.11 ТЗ, требование F-CUR-06.
 *
 * Модуль чистый: никаких обращений к БД, только вход → отчёт. Это позволяет
 * прогонять его и на сервере перед утверждением плана, и в конструкторе
 * по мере правки, и в тестах на эталонном плане 6В01601.
 *
 * Реализованы правила R-01…R-08 и R-11. Остальные правила раздела 2.11
 * относятся к другим модулям: R-09 и R-13 — к ИУП, R-10 — к академическому
 * календарю, R-14…R-20 — к регистрации, оцениванию и аудиту.
 *
 * Блокирующая ошибка (ERROR) делает утверждение плана невозможным.
 * Предупреждение (WARNING) утверждению не мешает, но показывается методисту:
 * это, как правило, следы переноса из .xls, а не нарушение норматива.
 */

import { HOURS_PER_CREDIT } from './constants';

export type Cycle = 'OOD' | 'BD' | 'PD' | 'IA' | 'DVO';
export type Component = 'OK' | 'VK' | 'KV';
export type ControlFormCode =
  | 'EXAM'
  | 'STATE_EXAM'
  | 'CREDIT_TEST'
  | 'COURSE_WORK'
  | 'PRACTICE_REPORT'
  | 'THESIS_DEFENSE'
  | 'COMPLEX_EXAM';

export type FindingLevel = 'ERROR' | 'WARNING';

/** Идентификаторы правил раздела 2.11 ТЗ, проверяемых этим модулем */
export type GosoRule = 'R-01' | 'R-02' | 'R-03' | 'R-04' | 'R-05' | 'R-06' | 'R-07' | 'R-08' | 'R-11';

/**
 * Проверки, не имеющие номера в ТЗ: следствия целостности данных плана.
 * Все они не блокирующие — норматив ГОСО ими не нарушается.
 */
export type ConsistencyCheck =
  | 'C-HOURS-SPLIT'
  | 'C-TERM-CREDITS'
  | 'C-CONTROL-TERM'
  | 'C-EMPTY-SLOT'
  | 'C-CHOOSE-N'
  | 'C-YEAR-LOAD';

export interface GosoFinding {
  rule: GosoRule | ConsistencyCheck;
  level: FindingLevel;
  /** Человекочитаемая формулировка для отчёта методисту */
  message: string;
  expected?: number | string;
  actual?: number | string;
  /** Позиции плана, к которым относится замечание */
  slotIds?: string[];
}

/** Обязательная дисциплина цикла ООД (ГОСО, п. 6) */
export interface MandatorySpec {
  slug: string;
  nameRu: string;
  credits: number;
  hours: number;
  controlForm: ControlFormCode;
  /** Модуль дробится вузом на дисциплины при неизменной сумме кредитов */
  isModule: boolean;
}

/** Нормативные объёмы профиля ГОСО */
export interface GosoProfileSpec {
  code: string;
  totalCredits: number;
  totalHoursMin: number;
  hoursPerCredit: number;
  oodCredits: number;
  oodOkCredits: number;
  oodVkKvCredits: number;
  bdPdCreditsMin: number;
  finalCertCreditsMin: number;
  yearCreditsNorm: number;
  mandatory: MandatorySpec[];
}

export interface SlotOptionSpec {
  disciplineId: string;
  nameRu: string;
  /** slug обязательной дисциплины ГОСО, если позиция закрывает её */
  gosoMandatorySlug: string | null;
}

export interface SlotSpec {
  id: string;
  slotCode: string | null;
  cycle: Cycle;
  component: Component;
  credits: number;
  totalHours: number;
  hoursLecture: number;
  hoursLab: number;
  hoursPractice: number;
  hoursIndividual: number;
  hoursSrs: number;
  hoursSrsp: number;
  hoursPracticeField: number;
  hoursThesis: number;
  controlForm: ControlFormCode;
  terms: number[];
  creditsByTerm: Record<string, number>;
  controlTerm: number | null;
  chooseN: number;
  isMinorSlot: boolean;
  options: SlotOptionSpec[];
}

export interface GosoTotals {
  credits: number;
  hours: number;
  ood: number;
  oodOk: number;
  oodVkKv: number;
  bdPd: number;
  ia: number;
  dvo: number;
  /** Кредиты профессиональной практики — входят в БД + ПД (раздел 2.5) */
  practice: number;
  /** Кредиты слотов минор-программы (F-CUR-04) */
  minor: number;
  /** Кредиты по семестрам: индекс 1 — первый семестр */
  byTerm: Record<number, number>;
  /** Кредиты по курсам: два семестра на курс (R-09) */
  byYear: Record<number, number>;
}

/** Строка панели соответствия «требуется / есть / отклонение» (F-CUR-07) */
export interface ComplianceRow {
  rule: GosoRule;
  label: string;
  required: number;
  actual: number;
  /** actual − required */
  delta: number;
  /** Норматив задан как «не менее», а не «ровно» */
  isMinimum: boolean;
  ok: boolean;
  unit: 'credits' | 'hours';
}

export interface GosoValidationResult {
  valid: boolean;
  totals: GosoTotals;
  compliance: ComplianceRow[];
  findings: GosoFinding[];
  errors: GosoFinding[];
  warnings: GosoFinding[];
}

/**
 * Кредиты хранятся как Decimal(5,2) и бывают дробными (0,5 кредита).
 * Складывать их как есть нельзя: 0.1 + 0.2 ≠ 0.3, и валидатор начинает
 * находить отклонение там, где его нет.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;
const eq = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;

/** Свод кредитов и часов плана по циклам, компонентам и семестрам */
export function summarize(slots: SlotSpec[]): GosoTotals {
  const totals: GosoTotals = {
    credits: 0, hours: 0, ood: 0, oodOk: 0, oodVkKv: 0, bdPd: 0, ia: 0, dvo: 0,
    practice: 0, minor: 0, byTerm: {}, byYear: {},
  };

  for (const s of slots) {
    totals.credits += s.credits;
    totals.hours += s.totalHours;

    if (s.cycle === 'OOD') {
      totals.ood += s.credits;
      if (s.component === 'OK') totals.oodOk += s.credits;
      else totals.oodVkKv += s.credits;
    } else if (s.cycle === 'BD' || s.cycle === 'PD') {
      totals.bdPd += s.credits;
    } else if (s.cycle === 'IA') {
      totals.ia += s.credits;
    } else {
      totals.dvo += s.credits;
    }

    if (s.hoursPracticeField > 0) totals.practice += s.credits;
    if (s.isMinorSlot) totals.minor += s.credits;

    // Разбивка по семестрам берётся из creditsByTerm, а при её отсутствии
    // кредиты делятся между семестрами позиции поровну
    const byTerm = Object.entries(s.creditsByTerm);
    if (byTerm.length > 0) {
      for (const [term, credits] of byTerm) {
        const t = Number(term);
        totals.byTerm[t] = round2((totals.byTerm[t] ?? 0) + Number(credits));
      }
    } else if (s.terms.length > 0) {
      const share = s.credits / s.terms.length;
      for (const t of s.terms) totals.byTerm[t] = round2((totals.byTerm[t] ?? 0) + share);
    }
  }

  for (const [term, credits] of Object.entries(totals.byTerm)) {
    const year = Math.ceil(Number(term) / 2);
    totals.byYear[year] = round2((totals.byYear[year] ?? 0) + credits);
  }

  for (const key of ['credits', 'hours', 'ood', 'oodOk', 'oodVkKv', 'bdPd', 'ia', 'dvo', 'practice', 'minor'] as const) {
    totals[key] = round2(totals[key]);
  }
  return totals;
}

/** Панель соответствия: что требует ГОСО, что есть в плане, каково отклонение */
export function buildCompliance(profile: GosoProfileSpec, totals: GosoTotals): ComplianceRow[] {
  const row = (
    rule: GosoRule,
    label: string,
    required: number,
    actual: number,
    isMinimum: boolean,
    unit: 'credits' | 'hours' = 'credits'
  ): ComplianceRow => ({
    rule,
    label,
    required,
    actual,
    delta: round2(actual - required),
    isMinimum,
    ok: isMinimum ? actual >= required || eq(actual, required) : eq(actual, required),
    unit,
  });

  return [
    row('R-02', 'Объём программы', profile.totalCredits, totals.credits, false),
    row('R-03', 'Цикл ООД', profile.oodCredits, totals.ood, false),
    row('R-04', 'ООД, обязательный компонент', profile.oodOkCredits, totals.oodOk, false),
    row('R-05', 'ООД, вузовский компонент и по выбору', profile.oodVkKvCredits, totals.oodVkKv, false),
    row('R-06', 'Циклы БД и ПД, включая практику', profile.bdPdCreditsMin, totals.bdPd, true),
    row('R-07', 'Итоговая аттестация', profile.finalCertCreditsMin, totals.ia, true),
    row('R-08', 'Объём в академических часах', profile.totalHoursMin, totals.hours, true, 'hours'),
  ];
}

/**
 * Полный прогон валидатора по плану.
 *
 * `strictHours` переводит R-01 в блокирующее правило: часы каждой позиции
 * обязаны равняться кредитам × 30. По умолчанию это предупреждение, и вот
 * почему: в разделе 2.11 ТЗ R-01 значится константой-настройкой профиля,
 * а не проверкой плана; объём в часах нормирует R-08 («не менее 7200»),
 * и он блокирует. Расхождение по отдельной позиции — обычный след переноса
 * из .xls, из-за которого нельзя запретить завести план целиком.
 *
 * Строгий режим оставлен для сверки перед сдачей плана в УМО.
 */
export function validateCurriculum(
  profile: GosoProfileSpec,
  slots: SlotSpec[],
  options: { strictHours?: boolean } = {}
): GosoValidationResult {
  const strictHours = options.strictHours ?? false;
  const totals = summarize(slots);
  const findings: GosoFinding[] = [];

  const add = (f: GosoFinding) => findings.push(f);

  // ── R-01: 1 кредит = 30 академических часов ────────────────────────────
  const hoursPerCredit = profile.hoursPerCredit || HOURS_PER_CREDIT;
  const badHours = slots.filter((s) => !eq(s.totalHours, s.credits * hoursPerCredit));
  if (badHours.length > 0) {
    add({
      rule: 'R-01',
      level: strictHours ? 'ERROR' : 'WARNING',
      message:
        `Объём в часах не равен кредитам × ${hoursPerCredit} у ${badHours.length} ` +
        `${plural(badHours.length, 'позиции', 'позиций', 'позиций')} плана: ` +
        badHours.map((s) => `${s.slotCode ?? '—'} (${s.credits} кр, ${s.totalHours} ч)`).join(', '),
      slotIds: badHours.map((s) => s.id),
    });
  }

  // ── R-02: сумма кредитов равна норме профиля ───────────────────────────
  if (!eq(totals.credits, profile.totalCredits)) {
    add({
      rule: 'R-02',
      level: 'ERROR',
      message: `Объём программы ${totals.credits} кредитов вместо ${profile.totalCredits} по профилю ${profile.code}`,
      expected: profile.totalCredits,
      actual: totals.credits,
    });
  }

  // ── R-03: цикл ООД — ровно 56 кредитов ─────────────────────────────────
  if (!eq(totals.ood, profile.oodCredits)) {
    add({
      rule: 'R-03',
      level: 'ERROR',
      message: `Цикл ООД — ${totals.ood} кредитов вместо ${profile.oodCredits}`,
      expected: profile.oodCredits,
      actual: totals.ood,
    });
  }

  // ── R-04: ООД ОК — ровно 51 кредит и все обязательные позиции ГОСО ─────
  if (!eq(totals.oodOk, profile.oodOkCredits)) {
    add({
      rule: 'R-04',
      level: 'ERROR',
      message: `Обязательный компонент цикла ООД — ${totals.oodOk} кредитов вместо ${profile.oodOkCredits}`,
      expected: profile.oodOkCredits,
      actual: totals.oodOk,
    });
  }
  findings.push(...checkMandatory(profile, slots));

  // ── R-05: ООД ВК/КВ — ровно 5 кредитов ─────────────────────────────────
  if (!eq(totals.oodVkKv, profile.oodVkKvCredits)) {
    add({
      rule: 'R-05',
      level: 'ERROR',
      message:
        `Вузовский компонент и компонент по выбору цикла ООД — ${totals.oodVkKv} ` +
        `кредитов вместо ${profile.oodVkKvCredits}`,
      expected: profile.oodVkKvCredits,
      actual: totals.oodVkKv,
    });
  }

  // ── R-06: БД + ПД не меньше минимума профиля ───────────────────────────
  if (totals.bdPd < profile.bdPdCreditsMin && !eq(totals.bdPd, profile.bdPdCreditsMin)) {
    add({
      rule: 'R-06',
      level: 'ERROR',
      message: `Циклы БД и ПД — ${totals.bdPd} кредитов, требуется не менее ${profile.bdPdCreditsMin}`,
      expected: profile.bdPdCreditsMin,
      actual: totals.bdPd,
    });
  }

  // ── R-07: итоговая аттестация не меньше минимума ───────────────────────
  if (totals.ia < profile.finalCertCreditsMin && !eq(totals.ia, profile.finalCertCreditsMin)) {
    add({
      rule: 'R-07',
      level: 'ERROR',
      message: `Итоговая аттестация — ${totals.ia} кредитов, требуется не менее ${profile.finalCertCreditsMin}`,
      expected: profile.finalCertCreditsMin,
      actual: totals.ia,
    });
  }

  // ── R-08: сумма часов не меньше норматива ──────────────────────────────
  if (totals.hours < profile.totalHoursMin) {
    add({
      rule: 'R-08',
      level: 'ERROR',
      message: `Объём программы ${totals.hours} часов, требуется не менее ${profile.totalHoursMin}`,
      expected: profile.totalHoursMin,
      actual: totals.hours,
    });
  }

  // ── R-11: «История Казахстана» — государственный экзамен в том же периоде
  findings.push(...checkHistoryStateExam(slots));

  // ── Проверки целостности данных плана ──────────────────────────────────
  findings.push(...checkConsistency(profile, slots, totals));

  const errors = findings.filter((f) => f.level === 'ERROR');
  return {
    valid: errors.length === 0,
    totals,
    compliance: buildCompliance(profile, totals),
    findings,
    errors,
    warnings: findings.filter((f) => f.level === 'WARNING'),
  };
}

/**
 * R-04, вторая половина: наличие всех обязательных дисциплин ГОСО и их объёмы.
 *
 * Модуль социально-политических знаний вуз вправе разбить на дисциплины
 * (в плане 6В01601 — «Социология и политология» 4 кр и «Культурология и
 * психология» 4 кр), поэтому объём сверяется суммой по slug, а не по позиции.
 */
function checkMandatory(profile: GosoProfileSpec, slots: SlotSpec[]): GosoFinding[] {
  if (profile.mandatory.length === 0) return [];
  const found = new Map<string, { credits: number; slotIds: string[] }>();

  for (const slot of slots) {
    const slugs = new Set(
      slot.options.map((o) => o.gosoMandatorySlug).filter((s): s is string => Boolean(s))
    );
    // Позиция закрывает обязательную дисциплину, если на неё указывает
    // хотя бы один вариант. Двух разных обязательных в одной позиции быть
    // не может — это ошибка привязки, и её видно по расхождению объёмов.
    for (const slug of slugs) {
      const acc = found.get(slug) ?? { credits: 0, slotIds: [] };
      acc.credits = round2(acc.credits + slot.credits / slugs.size);
      acc.slotIds.push(slot.id);
      found.set(slug, acc);
    }
  }

  const out: GosoFinding[] = [];
  for (const m of profile.mandatory) {
    const actual = found.get(m.slug);
    if (!actual) {
      out.push({
        rule: 'R-04',
        level: 'ERROR',
        message: `В цикле ООД нет обязательной дисциплины «${m.nameRu}» (${m.credits} кр)`,
        expected: m.credits,
        actual: 0,
      });
      continue;
    }
    // R-12: объём обязательной дисциплины вуз не сокращает.
    // Превышение нормативом не запрещено, но о нём стоит знать.
    if (actual.credits < m.credits && !eq(actual.credits, m.credits)) {
      out.push({
        rule: 'R-04',
        level: 'ERROR',
        message:
          `Обязательная дисциплина «${m.nameRu}» — ${actual.credits} кредитов вместо ` +
          `${m.credits}; объём дисциплин обязательного компонента вуз не сокращает`,
        expected: m.credits,
        actual: actual.credits,
        slotIds: actual.slotIds,
      });
    } else if (!eq(actual.credits, m.credits)) {
      out.push({
        rule: 'R-04',
        level: 'WARNING',
        message: `Обязательная дисциплина «${m.nameRu}» — ${actual.credits} кредитов при нормативе ${m.credits}`,
        expected: m.credits,
        actual: actual.credits,
        slotIds: actual.slotIds,
      });
    }
  }
  return out;
}

/**
 * R-11: по «Истории Казахстана» сдаётся государственный экзамен, причём
 * в том же академическом периоде, в котором дисциплина завершается.
 */
function checkHistoryStateExam(slots: SlotSpec[]): GosoFinding[] {
  const out: GosoFinding[] = [];
  const history = slots.filter((s) =>
    s.options.some((o) => o.gosoMandatorySlug === 'history_kz')
  );

  for (const slot of history) {
    if (slot.controlForm !== 'STATE_EXAM') {
      out.push({
        rule: 'R-11',
        level: 'ERROR',
        message:
          '«История Казахстана» должна иметь форму контроля «государственный экзамен», ' +
          `указана «${CONTROL_FORM_LABELS[slot.controlForm]}»`,
        expected: 'STATE_EXAM',
        actual: slot.controlForm,
        slotIds: [slot.id],
      });
    }
    if (slot.controlTerm != null && !slot.terms.includes(slot.controlTerm)) {
      out.push({
        rule: 'R-11',
        level: 'ERROR',
        message:
          `Государственный экзамен по «Истории Казахстана» назначен на ${slot.controlTerm}-й семестр, ` +
          `а дисциплина читается в ${slot.terms.join(', ')}-м: экзамен сдаётся в том же периоде`,
        expected: slot.terms.join(', '),
        actual: slot.controlTerm,
        slotIds: [slot.id],
      });
    }
  }
  return out;
}

/** Проверки целостности данных плана — не блокирующие */
function checkConsistency(
  profile: GosoProfileSpec,
  slots: SlotSpec[],
  totals: GosoTotals
): GosoFinding[] {
  const out: GosoFinding[] = [];

  const hoursSplitOff = slots.filter((s) => {
    const parts =
      s.hoursLecture + s.hoursLab + s.hoursPractice + s.hoursIndividual +
      s.hoursSrs + s.hoursSrsp + s.hoursPracticeField + s.hoursThesis;
    return parts !== s.totalHours;
  });
  if (hoursSplitOff.length > 0) {
    out.push({
      rule: 'C-HOURS-SPLIT',
      level: 'WARNING',
      message:
        `Сумма часов по видам работы не сходится с общим объёмом у позиций: ` +
        hoursSplitOff.map((s) => s.slotCode ?? '—').join(', '),
      slotIds: hoursSplitOff.map((s) => s.id),
    });
  }

  const termCreditsOff = slots.filter((s) => {
    const entries = Object.values(s.creditsByTerm);
    if (entries.length === 0) return false;
    return !eq(entries.reduce((a, b) => a + Number(b), 0), s.credits);
  });
  if (termCreditsOff.length > 0) {
    out.push({
      rule: 'C-TERM-CREDITS',
      level: 'WARNING',
      message:
        'Разбивка кредитов по семестрам не сходится с объёмом позиции: ' +
        termCreditsOff.map((s) => s.slotCode ?? '—').join(', '),
      slotIds: termCreditsOff.map((s) => s.id),
    });
  }

  const controlTermOff = slots.filter(
    (s) => s.controlTerm != null && s.terms.length > 0 && !s.terms.includes(s.controlTerm)
  );
  if (controlTermOff.length > 0) {
    out.push({
      rule: 'C-CONTROL-TERM',
      level: 'WARNING',
      message:
        'Семестр итогового контроля не входит в семестры изучения: ' +
        controlTermOff
          .map((s) => `${s.slotCode ?? '—'} (читается ${s.terms.join(', ')}, контроль ${s.controlTerm})`)
          .join('; '),
      slotIds: controlTermOff.map((s) => s.id),
    });
  }

  const empty = slots.filter((s) => s.options.length === 0);
  if (empty.length > 0) {
    out.push({
      rule: 'C-EMPTY-SLOT',
      level: 'WARNING',
      message:
        'Позиции плана без дисциплин: ' + empty.map((s) => s.slotCode ?? '—').join(', '),
      slotIds: empty.map((s) => s.id),
    });
  }

  // R-13 проверяется на ИУП, но позицию, где выбрать нужное число дисциплин
  // невозможно в принципе, лучше поймать здесь — на этапе конструктора
  const chooseOff = slots.filter((s) => s.options.length > 0 && s.chooseN > s.options.length);
  if (chooseOff.length > 0) {
    out.push({
      rule: 'C-CHOOSE-N',
      level: 'ERROR',
      message:
        'Требуется выбрать больше дисциплин, чем есть вариантов: ' +
        chooseOff
          .map((s) => `${s.slotCode ?? '—'} (выбрать ${s.chooseN} из ${s.options.length})`)
          .join('; '),
      slotIds: chooseOff.map((s) => s.id),
    });
  }

  // R-09: ориентир годовой нагрузки. Отклонение допускается с обоснованием,
  // поэтому здесь — только предупреждение.
  const norm = profile.yearCreditsNorm;
  if (norm > 0) {
    const off = Object.entries(totals.byYear).filter(([, credits]) => !eq(credits, norm));
    if (off.length > 0) {
      out.push({
        rule: 'C-YEAR-LOAD',
        level: 'WARNING',
        message:
          `Нагрузка учебного года отличается от ориентира в ${norm} кредитов: ` +
          off.map(([year, credits]) => `${year}-й курс — ${credits}`).join(', '),
      });
    }
  }

  return out;
}

export const CONTROL_FORM_LABELS: Record<ControlFormCode, string> = {
  EXAM: 'экзамен',
  STATE_EXAM: 'государственный экзамен',
  CREDIT_TEST: 'зачёт',
  COURSE_WORK: 'курсовая работа',
  PRACTICE_REPORT: 'отчёт по практике',
  THESIS_DEFENSE: 'защита дипломной работы',
  COMPLEX_EXAM: 'комплексный экзамен',
};

export const CYCLE_LABELS: Record<Cycle, string> = {
  OOD: 'ООД',
  BD: 'БД',
  PD: 'ПД',
  IA: 'ИА',
  DVO: 'ДВО',
};

export const COMPONENT_LABELS: Record<Component, string> = {
  OK: 'ОК',
  VK: 'ВК',
  KV: 'КВ',
};

/** Русское склонение после числительного */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
