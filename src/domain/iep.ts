/**
 * Индивидуальный учебный план — раздел 4.4 ТЗ, требования F-IEP-01…F-IEP-03.
 *
 * Модуль чистый: никаких обращений к БД. Одна и та же логика работает
 * в мастере формирования ИУП, в серверной проверке перед отправкой на
 * согласование и в тестах.
 *
 * Реализованы правила:
 *   R-09 — годовая нагрузка: ориентир 60 кредитов, отклонение допускается
 *          с обоснованием, поэтому это предупреждение, а не запрет;
 *   R-13 — из элективной позиции выбирается ровно `chooseN` дисциплин;
 *   R-14 — дисциплина недоступна, пока не освоены её пререквизиты.
 */

export type IepIssueLevel = 'ERROR' | 'WARNING';

export type IepRule =
  | 'R-09'
  | 'R-10'
  | 'R-13'
  | 'R-14'
  | 'I-MIN-CREDITS'
  | 'I-MAX-CREDITS'
  | 'I-EMPTY';

export interface IepIssue {
  rule: IepRule;
  level: IepIssueLevel;
  message: string;
  /** Позиции плана, к которым относится замечание */
  slotIds?: string[];
}

/** Позиция учебного плана в том виде, в каком её видит мастер ИУП */
export interface IepSlotSpec {
  id: string;
  slotCode: string | null;
  cycle: 'OOD' | 'BD' | 'PD' | 'IA' | 'DVO';
  component: 'OK' | 'VK' | 'KV';
  credits: number;
  /** Семестры изучения по учебному плану */
  terms: number[];
  controlTerm: number | null;
  /** Сколько дисциплин студент изучает из вариантов (R-13) */
  chooseN: number;
  isMinorSlot: boolean;
  options: {
    disciplineId: string;
    code: string;
    name: string;
    /** Дисциплины, которые должны быть освоены до этой (R-14) */
    prerequisiteIds: string[];
  }[];
}

/** Выбор студента: какая дисциплина закрывает позицию */
export interface IepSelection {
  slotId: string;
  disciplineId: string;
  /** Повторное изучение после оценки F (R-16) */
  isRetake?: boolean;
}

export interface IepLimits {
  /** Ориентир годовой нагрузки, обычно 60 (R-09) */
  normCredits: number;
  /** Жёсткие границы, задаваемые вузом в окне регистрации (F-IEP-02) */
  minCredits: number | null;
  maxCredits: number | null;
}

export interface IepContext {
  /** Порядковые семестры учебного года: для 2-го курса это [3, 4] */
  terms: number[];
  /** Дисциплины, уже освоенные студентом — основание для R-14 */
  completedDisciplineIds: string[];
  /** Дисциплины с оценкой F: требуют повторного изучения */
  failedDisciplineIds: string[];
  limits: IepLimits;
}

/** Позиция, предложенная студенту к включению в ИУП */
export interface IepSlotOffer {
  slot: IepSlotSpec;
  /** Обязательные позиции подставляются автоматически (F-IEP-01) */
  isAutomatic: boolean;
  /** Сколько дисциплин ещё нужно выбрать из этой позиции */
  toChoose: number;
  options: {
    disciplineId: string;
    code: string;
    name: string;
    /** Доступна ли дисциплина к выбору */
    available: boolean;
    /** Почему недоступна — показывается студенту (F-IEP-03) */
    blockedReason: string | null;
    /** Уже освоена ранее */
    completed: boolean;
    /** Требует повторного изучения после F */
    needsRetake: boolean;
  }[];
}

export interface IepPlan {
  offers: IepSlotOffer[];
  /** Кредиты, набранные текущим выбором */
  selectedCredits: number;
  /** Кредиты обязательных позиций — они в ИУП попадают всегда */
  automaticCredits: number;
  issues: IepIssue[];
  valid: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Позиции плана, которые изучаются в семестрах этого учебного года.
 *
 * Позиция попадает в год, если хотя бы один её семестр входит в год:
 * языки читаются в 1-м и 2-м семестрах и целиком относятся к первому курсу,
 * а физкультура (семестры 1–4) попадает и в первый год, и во второй.
 */
export function slotsForYear(slots: IepSlotSpec[], terms: number[]): IepSlotSpec[] {
  const set = new Set(terms);
  return slots.filter((s) => s.terms.some((t) => set.has(t)));
}

/**
 * Кредиты позиции, приходящиеся на семестры учебного года.
 *
 * Физкультура — 8 кредитов за четыре семестра, и в ИУП первого курса
 * должно попасть 4, а не 8. Без этого счётчик кредитов завышал бы нагрузку
 * и предупреждение R-09 срабатывало бы на корректном плане.
 */
export function creditsInYear(slot: IepSlotSpec, terms: number[]): number {
  if (slot.terms.length === 0) return slot.credits;
  const set = new Set(terms);
  const inYear = slot.terms.filter((t) => set.has(t)).length;
  if (inYear === 0) return 0;
  return round2((slot.credits / slot.terms.length) * inYear);
}

/**
 * F-IEP-01. Мастер формирования ИУП: что студент видит и что может выбрать.
 *
 * Обязательный компонент и вузовский компонент подставляются автоматически —
 * выбора там нет. Компонент по выбору требует решения студента, и по каждому
 * варианту сразу видно, доступен ли он и почему нет (F-IEP-03).
 */
export function buildIepPlan(
  slots: IepSlotSpec[],
  selections: IepSelection[],
  context: IepContext
): IepPlan {
  const yearSlots = slotsForYear(slots, context.terms);
  const completed = new Set(context.completedDisciplineIds);
  const failed = new Set(context.failedDisciplineIds);
  const selectedBySlot = new Map<string, IepSelection[]>();
  for (const sel of selections) {
    const list = selectedBySlot.get(sel.slotId) ?? [];
    list.push(sel);
    selectedBySlot.set(sel.slotId, list);
  }

  const offers: IepSlotOffer[] = yearSlots.map((slot) => {
    // Позиция без выбора: единственный вариант закрывает её целиком
    const isAutomatic = slot.component !== 'KV' && slot.options.length <= 1;
    const chosen = selectedBySlot.get(slot.id) ?? [];

    return {
      slot,
      isAutomatic,
      toChoose: Math.max(0, slot.chooseN - chosen.length),
      options: slot.options.map((o) => {
        const missing = o.prerequisiteIds.filter((id) => !completed.has(id));
        const isCompleted = completed.has(o.disciplineId);
        const needsRetake = failed.has(o.disciplineId);
        return {
          disciplineId: o.disciplineId,
          code: o.code,
          name: o.name,
          // Освоенная дисциплина недоступна к повторному выбору, если она
          // не провалена: пересдавать ради оценки нельзя (Типовые правила, п. 45)
          available: missing.length === 0 && (!isCompleted || needsRetake),
          blockedReason:
            missing.length > 0
              ? `Не освоены пререквизиты: ${missing.length} ${
                  missing.length === 1 ? 'дисциплина' : 'дисциплин'
                }`
              : isCompleted && !needsRetake
                ? 'Дисциплина уже освоена'
                : null,
          completed: isCompleted,
          needsRetake,
        };
      }),
    };
  });

  const automaticCredits = round2(
    offers
      .filter((o) => o.isAutomatic)
      .reduce((a, o) => a + creditsInYear(o.slot, context.terms), 0)
  );

  // Кредиты выбранных позиций считаются один раз на позицию, а не на
  // дисциплину: студент изучает одну из альтернатив, а не все сразу
  const chosenSlotIds = new Set(selections.map((s) => s.slotId));
  const chosenCredits = round2(
    offers
      .filter((o) => !o.isAutomatic && chosenSlotIds.has(o.slot.id))
      .reduce((a, o) => a + creditsInYear(o.slot, context.terms), 0)
  );

  const selectedCredits = round2(automaticCredits + chosenCredits);
  const issues = checkIep(offers, selections, selectedCredits, context);

  return {
    offers,
    selectedCredits,
    automaticCredits,
    issues,
    valid: issues.every((i) => i.level !== 'ERROR'),
  };
}

/** Проверки ИУП перед отправкой на согласование */
export function checkIep(
  offers: IepSlotOffer[],
  selections: IepSelection[],
  selectedCredits: number,
  context: IepContext
): IepIssue[] {
  const issues: IepIssue[] = [];
  const { limits } = context;

  if (offers.length === 0) {
    issues.push({
      rule: 'I-EMPTY',
      level: 'ERROR',
      message:
        'В учебном плане нет позиций для этого учебного года. Проверьте, что студенту ' +
        'назначен план года набора и указан правильный курс обучения.',
    });
    return issues;
  }

  // ── R-13: из элективной позиции выбирается ровно chooseN дисциплин ──────
  const underfilled = offers.filter((o) => !o.isAutomatic && o.toChoose > 0);
  if (underfilled.length > 0) {
    issues.push({
      rule: 'R-13',
      level: 'ERROR',
      message:
        'Не сделан выбор по позициям: ' +
        underfilled
          .map((o) => `${o.slot.slotCode ?? '—'} (выбрать ещё ${o.toChoose})`)
          .join(', '),
      slotIds: underfilled.map((o) => o.slot.id),
    });
  }

  const overfilled = offers.filter(
    (o) => !o.isAutomatic && o.slot.chooseN - o.toChoose > o.slot.chooseN
  );
  if (overfilled.length > 0) {
    issues.push({
      rule: 'R-13',
      level: 'ERROR',
      message:
        'Выбрано больше дисциплин, чем допускает позиция: ' +
        overfilled.map((o) => o.slot.slotCode ?? '—').join(', '),
      slotIds: overfilled.map((o) => o.slot.id),
    });
  }

  // ── R-14: регистрация невозможна без освоенных пререквизитов ────────────
  const byId = new Map(
    offers.flatMap((o) => o.options.map((opt) => [`${o.slot.id}:${opt.disciplineId}`, { o, opt }]))
  );
  const blocked = selections
    .map((s) => byId.get(`${s.slotId}:${s.disciplineId}`))
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .filter((x) => !x.opt.available);
  if (blocked.length > 0) {
    issues.push({
      rule: 'R-14',
      level: 'ERROR',
      message:
        'Выбраны недоступные дисциплины: ' +
        blocked.map((x) => `${x.opt.name} — ${x.opt.blockedReason}`).join('; '),
      slotIds: blocked.map((x) => x.o.slot.id),
    });
  }

  // ── Жёсткие лимиты кредитов из окна регистрации (F-IEP-02) ─────────────
  if (limits.maxCredits != null && selectedCredits > limits.maxCredits) {
    issues.push({
      rule: 'I-MAX-CREDITS',
      level: 'ERROR',
      message:
        `Набрано ${selectedCredits} кредитов при максимуме ${limits.maxCredits}. ` +
        'Уберите часть дисциплин по выбору.',
    });
  }
  if (limits.minCredits != null && selectedCredits < limits.minCredits) {
    issues.push({
      rule: 'I-MIN-CREDITS',
      level: 'ERROR',
      message: `Набрано ${selectedCredits} кредитов при минимуме ${limits.minCredits}.`,
    });
  }

  // ── R-09: ориентир годовой нагрузки, отклонение допускается ─────────────
  if (limits.normCredits > 0 && Math.abs(selectedCredits - limits.normCredits) > 0.005) {
    issues.push({
      rule: 'R-09',
      level: 'WARNING',
      message:
        `Нагрузка учебного года — ${selectedCredits} кредитов при ориентире ` +
        `${limits.normCredits}. Отклонение допускается с обоснованием.`,
    });
  }

  return issues;
}

/**
 * Порядковые семестры учебного года по курсу обучения.
 * Второй курс — это семестры 3 и 4 сквозной нумерации учебного плана.
 */
export function termsForCourse(course: number, termsPerYear = 2): number[] {
  const first = (course - 1) * termsPerYear + 1;
  return Array.from({ length: termsPerYear }, (_, i) => first + i);
}

/**
 * R-16. Номер попытки при регистрации.
 * FX даёт пересдачу итогового контроля без повторного изучения, поэтому
 * новая регистрация нужна только после F.
 */
export function nextAttemptNo(previousAttempts: { attemptNo: number }[]): number {
  if (previousAttempts.length === 0) return 1;
  return Math.max(...previousAttempts.map((a) => a.attemptNo)) + 1;
}

/**
 * F-IEP-05. Куда попадает студент при регистрации: на курс или в лист ожидания.
 * Квота `capacity` не задана — ограничения нет.
 */
export function placeRegistration(input: {
  capacity: number | null;
  registeredCount: number;
  waitlistCount: number;
}): { status: 'REGISTERED' | 'WAITLISTED'; waitlistPos: number | null } {
  if (input.capacity == null || input.registeredCount < input.capacity) {
    return { status: 'REGISTERED', waitlistPos: null };
  }
  return { status: 'WAITLISTED', waitlistPos: input.waitlistCount + 1 };
}

/** Открыто ли окно регистрации указанного вида на заданный момент (F-ACAD-03) */
export function isWindowOpen(
  window: { opensAt: Date; closesAt: Date } | null | undefined,
  now: Date = new Date()
): boolean {
  if (!window) return false;
  return now >= window.opensAt && now <= window.closesAt;
}

/**
 * R-10. Минимальная длительность академического периода (ГОСО, п. 27).
 * Летний семестр нормативом не ограничен.
 */
export const MIN_WEEKS_BY_PERIOD: Record<string, number> = {
  SEMESTER: 15,
  TRIMESTER: 10,
  QUARTER: 7,
  SUMMER: 0,
};

export function checkPeriodDuration(period: {
  type: string;
  weeksCount: number | null;
  startDate: Date;
  endDate: Date;
}): IepIssue | null {
  const required = MIN_WEEKS_BY_PERIOD[period.type] ?? 0;
  if (required === 0) return null;

  // Если недели не проставлены явно, считаем их по датам: период всё равно
  // должен укладываться в норматив, и молча пропускать проверку нельзя
  const weeks =
    period.weeksCount ??
    Math.floor(
      (period.endDate.getTime() - period.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

  if (weeks >= required) return null;
  return {
    rule: 'R-10',
    level: 'ERROR',
    message:
      `Длительность периода — ${weeks} ${weeks === 1 ? 'неделя' : 'недель'}, ` +
      `норматив для этого типа — не менее ${required}.`,
  };
}
