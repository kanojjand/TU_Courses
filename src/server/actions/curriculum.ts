'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { getCurriculum, validate } from '@/server/curriculum';

/**
 * Конструктор учебных планов — F-CUR-01…F-CUR-06.
 *
 * Ключевое ограничение раздела 4.2: утверждение плана с блокирующими
 * ошибками валидатора невозможно. Проверка выполняется здесь, на сервере,
 * а не только в интерфейсе: иначе её обходит прямой вызов действия.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const fail = (error: string): Result<never> => ({ ok: false, error });

/**
 * Сбрасывается кэш маршрута, а не конкретного адреса: revalidatePath с типом
 * 'page' ждёт шаблон маршрута с динамическими сегментами в скобках, и подстановка
 * реального идентификатора вместо `[id]` просто ничего не сбрасывает.
 */
function revalidate() {
  revalidatePath('/[locale]/admin/curricula', 'page');
  revalidatePath('/[locale]/admin/curricula/[id]', 'page');
  revalidatePath('/[locale]/admin/curricula/[id]/compare', 'page');
  revalidatePath('/[locale]/electives', 'page');
}

/**
 * Правки принимает только черновик и возвращённый на доработку план.
 * Утверждённый план правится через новую версию (F-CUR-01), иначе история
 * ИУП студентов ссылалась бы на позиции, которых уже нет.
 */
async function requireEditable(
  curriculumId: string
): Promise<{ ok: false; error: string } | { ok: true }> {
  const curriculum = await prisma.curriculum.findUnique({
    where: { id: curriculumId },
    select: { status: true },
  });
  if (!curriculum) return { ok: false, error: 'Учебный план не найден.' };
  if (curriculum.status === 'APPROVED' || curriculum.status === 'ARCHIVED') {
    return {
      ok: false,
      error:
        'Утверждённый план не редактируется. Создайте новую версию — ' +
        'история регистраций и ИУП должна остаться на прежней.',
    };
  }
  return { ok: true };
}

/** Пересчёт итогов плана: их показывает список, и они не должны отставать */
async function recalcTotals(curriculumId: string) {
  const agg = await prisma.curriculumSlot.aggregate({
    where: { curriculumId },
    _sum: { credits: true, totalHours: true },
  });
  await prisma.curriculum.update({
    where: { id: curriculumId },
    data: {
      totalCredits: agg._sum.credits ?? 0,
      totalHours: agg._sum.totalHours ?? 0,
    },
  });
}

// ── План ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  programId: z.string().trim().min(1, 'Выберите образовательную программу.'),
  gosoProfileId: z.string().trim().min(1, 'Выберите профиль ГОСО.'),
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  studyForm: z.enum(['FULL_TIME', 'PART_TIME', 'DISTANCE', 'EVENING']).default('FULL_TIME'),
  language: z.enum(['KK', 'RU', 'EN']).optional(),
  termsCount: z.coerce.number().int().min(1).max(20).default(8),
});

export type CreateCurriculumInput = z.input<typeof createSchema>;

/** F-CUR-01. Новый план: программа + год набора + версия */
export async function createCurriculum(
  input: CreateCurriculumInput
): Promise<Result<{ id: string }>> {
  const actor = await requirePermission('curriculum:edit');
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const data = parsed.data;

  // Версия назначается автоматически: год набора и форма обучения уникальны
  // в паре с версией, и вручную её угадывать неудобно
  const last = await prisma.curriculum.findFirst({
    where: {
      programId: data.programId,
      admissionYear: data.admissionYear,
      studyForm: data.studyForm,
    },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const created = await prisma.curriculum.create({
    data: {
      programId: data.programId,
      gosoProfileId: data.gosoProfileId,
      admissionYear: data.admissionYear,
      studyForm: data.studyForm,
      language: data.language,
      termsCount: data.termsCount,
      version: (last?.version ?? 0) + 1,
      createdById: actor.id,
    },
    select: { id: true, version: true },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_CREATE,
    entityType: 'Curriculum',
    entityId: created.id,
    newValue: { ...data, version: created.version },
  });

  revalidate();
  return { ok: true, data: { id: created.id } };
}

const updateSchema = z.object({
  id: z.string().trim().min(1),
  termsCount: z.coerce.number().int().min(1).max(20).optional(),
  councilProtocolNo: z.string().trim().max(100).optional(),
  councilDate: z.string().trim().optional(),
  language: z.enum(['KK', 'RU', 'EN']).optional(),
});

export async function updateCurriculum(input: z.input<typeof updateSchema>): Promise<Result> {
  const actor = await requirePermission('curriculum:edit');
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, councilDate, ...rest } = parsed.data;

  const check = await requireEditable(id);
  if (!check.ok) return fail(check.error);

  await prisma.curriculum.update({
    where: { id },
    data: { ...rest, councilDate: councilDate ? new Date(councilDate) : undefined },
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_UPDATE,
    entityType: 'Curriculum',
    entityId: id,
    newValue: parsed.data,
  });

  revalidate();
  return { ok: true };
}

/** F-CUR-10. Копия плана как следующая версия — основа для правок */
export async function copyCurriculumVersion(id: string): Promise<Result<{ id: string }>> {
  const actor = await requirePermission('curriculum:edit');
  const source = await getCurriculum(id);
  if (!source) return fail('Учебный план не найден.');

  const last = await prisma.curriculum.findFirst({
    where: {
      programId: source.programId,
      admissionYear: source.admissionYear,
      studyForm: source.studyForm,
    },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  // Копирование идёт четырьмя пакетными запросами, а не позицией за позицией:
  // в плане 6В01601 сорок семь позиций и семьдесят один вариант дисциплины,
  // и шесть десятков последовательных обращений к базе не укладывались
  // в пятисекундный лимит интерактивной транзакции Prisma.
  // createManyAndReturn на PostgreSQL сохраняет порядок входных строк —
  // на этом и строится сопоставление старых идентификаторов с новыми.
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.curriculum.create({
      data: {
        programId: source.programId,
        gosoProfileId: source.gosoProfileId,
        admissionYear: source.admissionYear,
        studyForm: source.studyForm,
        language: source.language,
        termsCount: source.termsCount,
        version: (last?.version ?? source.version) + 1,
        createdById: actor.id,
        totalCredits: source.totalCredits,
        totalHours: source.totalHours,
      },
      select: { id: true },
    });

    // Модули копируются первыми: позиции ссылаются на них
    const newModules = await tx.curriculumModule.createManyAndReturn({
      data: source.modules.map((m) => ({
        curriculumId: created.id,
        code: m.code,
        nameKk: m.nameKk,
        nameRu: m.nameRu,
        nameEn: m.nameEn,
        sortOrder: m.sortOrder,
      })),
      select: { id: true },
    });
    const moduleMap = new Map(source.modules.map((m, i) => [m.id, newModules[i]!.id]));

    const newSlots = await tx.curriculumSlot.createManyAndReturn({
      data: source.slots.map((s) => ({
        curriculumId: created.id,
        moduleId: s.moduleId ? (moduleMap.get(s.moduleId) ?? null) : null,
        slotCode: s.slotCode,
        cycle: s.cycle,
        component: s.component,
        credits: s.credits,
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
        hasCourseWork: s.hasCourseWork,
        terms: s.terms,
        creditsByTerm: s.creditsByTerm ?? {},
        controlTerm: s.controlTerm,
        teachingLang: s.teachingLang,
        chooseN: s.chooseN,
        isMinorSlot: s.isMinorSlot,
        sortOrder: s.sortOrder,
      })),
      select: { id: true },
    });

    const options = source.slots.flatMap((s, i) =>
      s.options.map((o) => ({
        slotId: newSlots[i]!.id,
        disciplineId: o.disciplineId,
        isDefault: o.isDefault,
        isMinorPlaceholder: o.isMinorPlaceholder,
        sortOrder: o.sortOrder,
      }))
    );
    if (options.length > 0) await tx.curriculumSlotOption.createMany({ data: options });

    return created;
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_COPY,
    entityType: 'Curriculum',
    entityId: copy.id,
    oldValue: { sourceId: id, version: source.version },
  });

  revalidate();
  return { ok: true, data: { id: copy.id } };
}

// ── Модули плана ────────────────────────────────────────────────────────────

const moduleSchema = z.object({
  curriculumId: z.string().trim().min(1),
  id: z.string().trim().optional(),
  code: z.string().trim().max(50).optional(),
  nameKk: z.string().trim().min(1, 'Укажите наименование на казахском.'),
  nameRu: z.string().trim().min(1, 'Укажите наименование на русском.'),
  nameEn: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export async function saveModule(input: z.input<typeof moduleSchema>): Promise<Result> {
  await requirePermission('curriculum:edit');
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { curriculumId, id, ...data } = parsed.data;

  const check = await requireEditable(curriculumId);
  if (!check.ok) return fail(check.error);

  if (id) await prisma.curriculumModule.update({ where: { id }, data });
  else await prisma.curriculumModule.create({ data: { curriculumId, ...data } });

  revalidate();
  return { ok: true };
}

export async function deleteModule(curriculumId: string, id: string): Promise<Result> {
  await requirePermission('curriculum:edit');
  const check = await requireEditable(curriculumId);
  if (!check.ok) return fail(check.error);

  // Позиции модуля не удаляются вместе с ним — они просто теряют группировку
  await prisma.curriculumModule.delete({ where: { id } });
  revalidate();
  return { ok: true };
}

// ── Позиции плана ───────────────────────────────────────────────────────────

const slotSchema = z.object({
  curriculumId: z.string().trim().min(1),
  id: z.string().trim().optional(),
  moduleId: z.string().trim().optional(),
  slotCode: z.string().trim().max(50).optional(),
  cycle: z.enum(['OOD', 'BD', 'PD', 'IA', 'DVO']),
  component: z.enum(['OK', 'VK', 'KV']),
  credits: z.coerce.number().positive('Кредиты должны быть больше нуля.').max(100),
  hoursLecture: z.coerce.number().int().min(0).default(0),
  hoursLab: z.coerce.number().int().min(0).default(0),
  hoursPractice: z.coerce.number().int().min(0).default(0),
  hoursIndividual: z.coerce.number().int().min(0).default(0),
  hoursSrs: z.coerce.number().int().min(0).default(0),
  hoursSrsp: z.coerce.number().int().min(0).default(0),
  hoursPracticeField: z.coerce.number().int().min(0).default(0),
  hoursThesis: z.coerce.number().int().min(0).default(0),
  controlForm: z.enum([
    'EXAM',
    'STATE_EXAM',
    'CREDIT_TEST',
    'COURSE_WORK',
    'PRACTICE_REPORT',
    'THESIS_DEFENSE',
    'COMPLEX_EXAM',
  ]),
  hasCourseWork: z.coerce.boolean().default(false),
  terms: z.array(z.coerce.number().int().min(1).max(20)).min(1, 'Укажите хотя бы один семестр.'),
  controlTerm: z.coerce.number().int().min(1).max(20).optional(),
  teachingLang: z.string().trim().max(10).optional(),
  chooseN: z.coerce.number().int().min(1).max(10).default(1),
  isMinorSlot: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  /** Дисциплины-варианты; для ОК и ВК — одна, для КВ — 2–3 (F-CUR-03) */
  disciplineIds: z.array(z.string().trim().min(1)).default([]),
});

export type SaveSlotInput = z.input<typeof slotSchema>;

/**
 * F-CUR-02. Сохранение позиции плана.
 *
 * Часы вводятся по видам работы, а общий объём считается их суммой:
 * так пользователь не может ввести итог, не сходящийся с разбивкой.
 * Соответствие «кредиты × 30» проверяет валидатор (R-01) — здесь оно
 * не навязывается, иначе не завести позицию, перенесённую из .xls
 * с расхождением, и не увидеть отчёт о нём.
 */
export async function saveSlot(input: SaveSlotInput): Promise<Result<{ id: string }>> {
  const actor = await requirePermission('curriculum:edit');
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { curriculumId, id, disciplineIds, controlTerm, terms, ...rest } = parsed.data;

  const check = await requireEditable(curriculumId);
  if (!check.ok) return fail(check.error);

  if (disciplineIds.length > 0 && rest.chooseN > disciplineIds.length) {
    return fail(
      `Нельзя выбрать ${rest.chooseN} дисциплин из ${disciplineIds.length}: ` +
        'уменьшите число выбираемых или добавьте варианты.'
    );
  }

  const totalHours =
    rest.hoursLecture + rest.hoursLab + rest.hoursPractice + rest.hoursIndividual +
    rest.hoursSrs + rest.hoursSrsp + rest.hoursPracticeField + rest.hoursThesis;

  // Кредиты делятся между семестрами поровну: точная разбивка правится
  // отдельно, а для вводимой вручную позиции равные доли — разумное начало
  const share = Math.round((rest.credits / terms.length) * 100) / 100;
  const creditsByTerm = Object.fromEntries(terms.map((t) => [String(t), share]));

  const data = {
    ...rest,
    terms,
    controlTerm: controlTerm ?? terms[terms.length - 1],
    creditsByTerm,
    totalHours,
  };

  const previous = id
    ? await prisma.curriculumSlot.findUnique({ where: { id }, include: { options: true } })
    : null;

  const slot = await prisma.$transaction(async (tx) => {
    const saved = id
      ? await tx.curriculumSlot.update({ where: { id }, data, select: { id: true } })
      : await tx.curriculumSlot.create({
          data: { curriculumId, ...data },
          select: { id: true },
        });

    // Состав вариантов переписывается целиком: попытки вычислить разницу
    // усложняют код ради экономии на двух запросах
    await tx.curriculumSlotOption.deleteMany({ where: { slotId: saved.id } });
    if (disciplineIds.length > 0) {
      await tx.curriculumSlotOption.createMany({
        data: disciplineIds.map((disciplineId, i) => ({
          slotId: saved.id,
          disciplineId,
          isDefault: i === 0,
          sortOrder: i,
        })),
      });
    }
    return saved;
  });

  await recalcTotals(curriculumId);
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: id ? AUDIT_ACTIONS.SLOT_UPDATE : AUDIT_ACTIONS.SLOT_CREATE,
    entityType: 'CurriculumSlot',
    entityId: slot.id,
    oldValue: previous
      ? { credits: previous.credits, cycle: previous.cycle, component: previous.component }
      : undefined,
    newValue: { credits: data.credits, cycle: data.cycle, component: data.component },
  });

  revalidate();
  return { ok: true, data: { id: slot.id } };
}

/**
 * R-12: дисциплины обязательного компонента нельзя удалить.
 * Проверка здесь, а не только в валидаторе: удаление — необратимое действие,
 * и отчёт постфактум пользы не приносит.
 */
export async function deleteSlot(curriculumId: string, id: string): Promise<Result> {
  const actor = await requirePermission('curriculum:edit');
  const check = await requireEditable(curriculumId);
  if (!check.ok) return fail(check.error);

  const slot = await prisma.curriculumSlot.findUnique({
    where: { id },
    include: {
      options: { include: { discipline: { select: { gosoMandatory: { select: { nameRu: true } } } } } },
    },
  });
  if (!slot) return fail('Позиция плана не найдена.');

  const mandatory = slot.options.find((o) => o.discipline.gosoMandatory);
  if (mandatory) {
    return fail(
      `«${mandatory.discipline.gosoMandatory!.nameRu}» — дисциплина обязательного ` +
        'компонента ГОСО, её нельзя удалить из плана.'
    );
  }

  await prisma.curriculumSlot.delete({ where: { id } });
  await recalcTotals(curriculumId);
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.SLOT_DELETE,
    entityType: 'CurriculumSlot',
    entityId: id,
    oldValue: { slotCode: slot.slotCode, credits: slot.credits, cycle: slot.cycle },
  });

  revalidate();
  return { ok: true };
}

// ── Валидатор и маршрут утверждения ─────────────────────────────────────────

/** F-CUR-06. Прогон валидатора ГОСО с сохранением отчёта */
export async function runValidation(
  id: string,
  options: { strictHours?: boolean } = {}
): Promise<Result<{ valid: boolean; errors: number; warnings: number }>> {
  const actor = await requirePermission('curriculum:view');
  const curriculum = await getCurriculum(id);
  if (!curriculum) return fail('Учебный план не найден.');

  const result = validate(curriculum, options);
  await prisma.curriculumValidation.create({
    data: {
      curriculumId: id,
      runById: actor.id,
      isValid: result.valid,
      findings: result.findings as never,
    },
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_VALIDATE,
    entityType: 'Curriculum',
    entityId: id,
    newValue: { valid: result.valid, errors: result.errors.length, warnings: result.warnings.length },
  });

  revalidate();
  return {
    ok: true,
    data: { valid: result.valid, errors: result.errors.length, warnings: result.warnings.length },
  };
}

/** Черновик → на согласовании */
export async function submitCurriculum(id: string): Promise<Result> {
  const actor = await requirePermission('curriculum:edit');
  const check = await requireEditable(id);
  if (!check.ok) return fail(check.error);

  await prisma.curriculum.update({
    where: { id },
    data: { status: 'SUBMITTED', rejectionReason: null },
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_SUBMIT,
    entityType: 'Curriculum',
    entityId: id,
  });

  revalidate();
  return { ok: true };
}

const approveSchema = z.object({
  id: z.string().trim().min(1),
  councilProtocolNo: z.string().trim().min(1, 'Укажите номер протокола Учёного совета.'),
  councilDate: z.string().trim().min(1, 'Укажите дату протокола.'),
});

/**
 * F-CUR-06. Утверждение плана.
 *
 * Валидатор запускается заново прямо здесь, а не берётся последний сохранённый
 * отчёт: между прогоном и утверждением план могли поправить, и утверждение
 * опиралось бы на устаревшую проверку.
 */
export async function approveCurriculum(input: z.input<typeof approveSchema>): Promise<Result> {
  const actor = await requirePermission('curriculum:approve');
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, councilProtocolNo, councilDate } = parsed.data;

  const curriculum = await getCurriculum(id);
  if (!curriculum) return fail('Учебный план не найден.');
  if (curriculum.status === 'APPROVED') return fail('План уже утверждён.');

  const result = validate(curriculum);
  if (!result.valid) {
    // Отчёт сохраняется и при отказе: методисту нужно видеть, что именно
    // помешало утверждению
    await prisma.curriculumValidation.create({
      data: {
        curriculumId: id,
        runById: actor.id,
        isValid: false,
        findings: result.findings as never,
      },
    });
    revalidate();
    return fail(
      `Утверждение невозможно: валидатор ГОСО нашёл ${result.errors.length} ` +
        `${result.errors.length === 1 ? 'блокирующую ошибку' : 'блокирующих ошибок'}. ` +
        result.errors.map((e) => `${e.rule}: ${e.message}`).join(' ')
    );
  }

  await prisma.$transaction([
    prisma.curriculumValidation.create({
      data: {
        curriculumId: id,
        runById: actor.id,
        isValid: true,
        findings: result.findings as never,
      },
    }),
    prisma.curriculum.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: actor.id,
        approvedAt: new Date(),
        councilProtocolNo,
        councilDate: new Date(councilDate),
        rejectionReason: null,
      },
    }),
  ]);

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_APPROVE,
    entityType: 'Curriculum',
    entityId: id,
    oldValue: { status: curriculum.status },
    newValue: { status: 'APPROVED', councilProtocolNo, councilDate },
  });

  revalidate();
  return { ok: true };
}

const rejectSchema = z.object({
  id: z.string().trim().min(1),
  reason: z.string().trim().min(10, 'Опишите причину возврата — не менее 10 символов.'),
});

export async function rejectCurriculum(input: z.input<typeof rejectSchema>): Promise<Result> {
  const actor = await requirePermission('curriculum:approve');
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, reason } = parsed.data;

  await prisma.curriculum.update({
    where: { id },
    data: { status: 'REJECTED', rejectionReason: reason },
  });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_REJECT,
    entityType: 'Curriculum',
    entityId: id,
    reason,
  });

  revalidate();
  return { ok: true };
}

export async function archiveCurriculum(id: string): Promise<Result> {
  const actor = await requirePermission('curriculum:approve');
  await prisma.curriculum.update({ where: { id }, data: { status: 'ARCHIVED' } });
  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.CURRICULUM_ARCHIVE,
    entityType: 'Curriculum',
    entityId: id,
  });

  revalidate();
  return { ok: true };
}
