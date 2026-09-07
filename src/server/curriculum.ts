import 'server-only';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  validateCurriculum,
  summarize,
  buildCompliance,
  type GosoProfileSpec,
  type SlotSpec,
  type GosoValidationResult,
} from '@/domain/goso';

/**
 * Чтение учебных планов — модуль CUR, раздел 4.2 ТЗ.
 *
 * Здесь же — мост между хранилищем и чистым валидатором: Prisma отдаёт
 * кредиты как Decimal, а `src/domain/goso.ts` работает с number, поэтому
 * преобразование выполняется в одном месте.
 */

const dec = (v: Prisma.Decimal | number | null): number =>
  v == null ? 0 : typeof v === 'number' ? v : v.toNumber();

/** Позиции плана вместе с вариантами дисциплин — в порядке печатной формы */
const slotInclude = {
  options: {
    include: {
      discipline: {
        select: {
          id: true,
          code: true,
          nameKk: true,
          nameRu: true,
          nameEn: true,
          isPractice: true,
          gosoMandatory: { select: { slug: true, nameRu: true } },
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.CurriculumSlotInclude;

const curriculumInclude = {
  program: {
    select: {
      id: true,
      code: true,
      nameKk: true,
      nameRu: true,
      nameEn: true,
      department: { select: { id: true, code: true, nameRu: true, facultyId: true } },
    },
  },
  gosoProfile: { include: { mandatory: { orderBy: { sortOrder: 'asc' } } } },
  modules: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  slots: { include: slotInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  createdBy: { select: { id: true, lastNameRu: true, firstNameRu: true } },
  approvedBy: { select: { id: true, lastNameRu: true, firstNameRu: true } },
  validations: { orderBy: { runAt: 'desc' }, take: 5 },
} satisfies Prisma.CurriculumInclude;

export type CurriculumDetail = Prisma.CurriculumGetPayload<{ include: typeof curriculumInclude }>;
export type CurriculumSlotDetail = CurriculumDetail['slots'][number];

export async function getCurriculum(id: string): Promise<CurriculumDetail | null> {
  return prisma.curriculum.findUnique({ where: { id }, include: curriculumInclude });
}

export async function listCurricula(filter: { programId?: string } = {}) {
  return prisma.curriculum.findMany({
    where: { programId: filter.programId },
    include: {
      program: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
      gosoProfile: { select: { code: true, totalCredits: true } },
      _count: { select: { slots: true, modules: true } },
      validations: { orderBy: { runAt: 'desc' }, take: 1, select: { isValid: true, runAt: true } },
    },
    orderBy: [{ admissionYear: 'desc' }, { version: 'desc' }],
  });
}

/** Профиль ГОСО в виде, который принимает валидатор */
export function toProfileSpec(
  profile: CurriculumDetail['gosoProfile']
): GosoProfileSpec {
  return {
    code: profile.code,
    totalCredits: profile.totalCredits,
    totalHoursMin: profile.totalHoursMin,
    hoursPerCredit: profile.hoursPerCredit,
    oodCredits: profile.oodCredits,
    oodOkCredits: profile.oodOkCredits,
    oodVkKvCredits: profile.oodVkKvCredits,
    bdPdCreditsMin: profile.bdPdCreditsMin,
    finalCertCreditsMin: profile.finalCertCreditsMin,
    yearCreditsNorm: profile.yearCreditsNorm,
    mandatory: profile.mandatory.map((m) => ({
      slug: m.slug,
      nameRu: m.nameRu,
      credits: m.credits,
      hours: m.hours,
      controlForm: m.controlForm,
      isModule: m.isModule,
    })),
  };
}

/** Позиции плана в виде, который принимает валидатор */
export function toSlotSpecs(slots: CurriculumSlotDetail[]): SlotSpec[] {
  return slots.map((s) => ({
    id: s.id,
    slotCode: s.slotCode,
    cycle: s.cycle,
    component: s.component,
    credits: dec(s.credits),
    totalHours: s.totalHours,
    hoursLecture: s.hoursLecture,
    hoursLab: s.hoursLab,
    hoursPractice: s.hoursPractice,
    hoursIndividual: s.hoursIndividual,
    hoursSrs: s.hoursSrs,
    hoursSrsp: s.hoursSrsp,
    hoursPracticeField: s.hoursPracticeField,
    hoursThesis: s.hoursThesis,
    controlForm: s.controlForm,
    terms: s.terms,
    creditsByTerm: normalizeTermCredits(s.creditsByTerm),
    controlTerm: s.controlTerm,
    chooseN: s.chooseN,
    isMinorSlot: s.isMinorSlot,
    options: s.options.map((o) => ({
      disciplineId: o.disciplineId,
      nameRu: o.discipline.nameRu,
      gosoMandatorySlug: o.discipline.gosoMandatory?.slug ?? null,
    })),
  }));
}

/**
 * `creditsByTerm` хранится как Json и приходит из Prisma нетипизированным.
 * Приводим к Record<string, number>, отбрасывая мусор: план, привезённый
 * импортом, может содержать строки вместо чисел.
 */
function normalizeTermCredits(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [term, credits] of Object.entries(value)) {
    const n = Number(credits);
    if (Number.isFinite(n) && /^\d+$/.test(term)) out[term] = n;
  }
  return out;
}

/** Прогон валидатора по сохранённому плану (F-CUR-06) */
export function validate(
  curriculum: CurriculumDetail,
  options: { strictHours?: boolean } = {}
): GosoValidationResult {
  return validateCurriculum(
    toProfileSpec(curriculum.gosoProfile),
    toSlotSpecs(curriculum.slots),
    options
  );
}

/** Свод и панель соответствия без полного прогона — для списков и карточек */
export function quickTotals(curriculum: CurriculumDetail) {
  const totals = summarize(toSlotSpecs(curriculum.slots));
  return { totals, compliance: buildCompliance(toProfileSpec(curriculum.gosoProfile), totals) };
}

/**
 * F-CUR-11. Каталог элективных дисциплин: позиции компонента по выбору
 * утверждённых планов, сгруппированные по программам и семестрам.
 *
 * Формируется из плана автоматически — отдельной сущности КЭД нет, иначе
 * каталог и план разъезжались бы при каждой правке.
 */
export async function electiveCatalog(filter: {
  admissionYear?: number;
  programId?: string;
}) {
  const curricula = await prisma.curriculum.findMany({
    where: {
      status: 'APPROVED',
      admissionYear: filter.admissionYear,
      programId: filter.programId,
    },
    include: {
      program: { select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true } },
      slots: {
        // Каталог показывает только то, из чего студент действительно выбирает
        where: { component: 'KV' },
        include: slotInclude,
        orderBy: [{ controlTerm: 'asc' }, { sortOrder: 'asc' }],
      },
    },
    orderBy: [{ admissionYear: 'desc' }, { version: 'desc' }],
  });

  return curricula
    .filter((c) => c.slots.length > 0)
    .map((c) => ({
      curriculumId: c.id,
      admissionYear: c.admissionYear,
      program: c.program,
      slots: c.slots.map((s) => ({
        id: s.id,
        slotCode: s.slotCode,
        cycle: s.cycle,
        credits: dec(s.credits),
        totalHours: s.totalHours,
        controlForm: s.controlForm,
        controlTerm: s.controlTerm,
        terms: s.terms,
        chooseN: s.chooseN,
        isMinorSlot: s.isMinorSlot,
        options: s.options.map((o) => o.discipline),
      })),
    }));
}

/** Годы набора, по которым есть утверждённые планы — для фильтра каталога */
export async function electiveCatalogYears(): Promise<number[]> {
  const rows = await prisma.curriculum.findMany({
    where: { status: 'APPROVED' },
    select: { admissionYear: true },
    distinct: ['admissionYear'],
    orderBy: { admissionYear: 'desc' },
  });
  return rows.map((r) => r.admissionYear);
}

export interface SlotDiff {
  slotCode: string | null;
  nameRu: string;
  kind: 'added' | 'removed' | 'changed';
  changes: { field: string; label: string; before: string; after: string }[];
}

/**
 * F-CUR-10. Сравнение двух версий плана.
 *
 * Позиции сопоставляются по шифру (slotCode) — он переживает правки состава
 * дисциплин. Позиции без шифра сопоставляются по наименованию первой
 * дисциплины: иначе перенумерация выглядела бы как полная замена плана.
 */
export function compareCurricula(a: CurriculumDetail, b: CurriculumDetail): SlotDiff[] {
  const key = (s: CurriculumSlotDetail) =>
    s.slotCode?.trim() || s.options[0]?.discipline.nameRu || s.id;

  const left = new Map(a.slots.map((s) => [key(s), s]));
  const right = new Map(b.slots.map((s) => [key(s), s]));
  const diffs: SlotDiff[] = [];

  const nameOf = (s: CurriculumSlotDetail) =>
    s.options.map((o) => o.discipline.nameRu).join(' / ') || '(без дисциплин)';

  for (const [k, before] of left) {
    const after = right.get(k);
    if (!after) {
      diffs.push({ slotCode: before.slotCode, nameRu: nameOf(before), kind: 'removed', changes: [] });
      continue;
    }
    const changes: SlotDiff['changes'] = [];
    const cmp = (field: string, label: string, x: unknown, y: unknown) => {
      const bs = String(x);
      const as = String(y);
      if (bs !== as) changes.push({ field, label, before: bs, after: as });
    };
    cmp('credits', 'Кредиты', dec(before.credits), dec(after.credits));
    cmp('totalHours', 'Часы', before.totalHours, after.totalHours);
    cmp('cycle', 'Цикл', before.cycle, after.cycle);
    cmp('component', 'Компонент', before.component, after.component);
    cmp('controlForm', 'Форма контроля', before.controlForm, after.controlForm);
    cmp('controlTerm', 'Семестр контроля', before.controlTerm ?? '—', after.controlTerm ?? '—');
    cmp('terms', 'Семестры', before.terms.join(', '), after.terms.join(', '));
    cmp('options', 'Дисциплины', nameOf(before), nameOf(after));
    if (changes.length > 0) {
      diffs.push({ slotCode: after.slotCode, nameRu: nameOf(after), kind: 'changed', changes });
    }
  }

  for (const [k, after] of right) {
    if (!left.has(k)) {
      diffs.push({ slotCode: after.slotCode, nameRu: nameOf(after), kind: 'added', changes: [] });
    }
  }

  return diffs;
}
