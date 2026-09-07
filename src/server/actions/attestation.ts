'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma, dec } from '@/lib/prisma';
import { requirePermission, requireUser, AccessError } from '@/server/guards';
import { hasRole } from '@/lib/rbac';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import {
  checkPlacement,
  canScheduleAttestation,
  canIssueDiploma,
} from '@/domain/attestation';
import { honoursReport } from '@/server/assessment';
import { letterForScore, STANDARD_GRADE_SCALE } from '@/domain/grading';

/**
 * Практика и итоговая аттестация — F-PRC-02…F-PRC-04, F-FIN-01…F-FIN-07.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/admin/practice', 'page');
  revalidatePath('/[locale]/admin/attestation', 'page');
  revalidatePath('/[locale]/my/practice', 'page');
}

// ── Базы практики (F-PRC-02) ────────────────────────────────────────────────

const baseSchema = z.object({
  id: z.string().trim().optional(),
  nameRu: z.string().trim().min(1, 'Укажите наименование организации.').max(300),
  nameKk: z.string().trim().max(300).optional(),
  bin: z.string().trim().max(12).optional(),
  address: z.string().trim().max(500).optional(),
  contactPerson: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  profileNote: z.string().trim().max(500).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
  contractNo: z.string().trim().max(100).optional(),
  contractFrom: z.string().trim().optional(),
  contractTo: z.string().trim().optional(),
  isActive: z.coerce.boolean().default(true),
});

export type SaveBaseInput = z.input<typeof baseSchema>;

export async function savePracticeBase(input: SaveBaseInput): Promise<Result> {
  const actor = await requirePermission('enrollment:manage');
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, contractFrom, contractTo, capacity, ...rest } = parsed.data;

  const data = {
    ...rest,
    capacity: capacity ?? null,
    contractFrom: contractFrom ? new Date(contractFrom) : null,
    contractTo: contractTo ? new Date(contractTo) : null,
  };

  const saved = id
    ? await prisma.practiceBase.update({ where: { id }, data, select: { id: true } })
    : await prisma.practiceBase.create({ data, select: { id: true } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PRACTICE_BASE_SAVE,
    entityType: 'PracticeBase',
    entityId: saved.id,
    newValue: { nameRu: rest.nameRu, capacity: capacity ?? null },
  });

  revalidate();
  return { ok: true };
}

// ── Распределение на практику (F-PRC-03) ────────────────────────────────────

const placementSchema = z.object({
  id: z.string().trim().optional(),
  studentId: z.string().trim().min(1),
  baseId: z.string().trim().optional(),
  slotId: z.string().trim().optional(),
  periodId: z.string().trim().optional(),
  kind: z.enum(['EDUCATIONAL', 'PEDAGOGICAL', 'RESEARCH', 'PRODUCTION', 'PRE_DIPLOMA']),
  startsOn: z.string().trim().min(1, 'Укажите дату начала.'),
  endsOn: z.string().trim().min(1, 'Укажите дату окончания.'),
  credits: z.coerce.number().positive().max(60),
  supervisorId: z.string().trim().optional(),
  supervisorBaseName: z.string().trim().max(200).optional(),
  orderNo: z.string().trim().max(100).optional(),
});

export type SavePlacementInput = z.input<typeof placementSchema>;

/**
 * F-PRC-03. Распределение обучающегося на базу практики.
 *
 * Соответствие профиля базы профилю Major проверяется системой: при наличии
 * Minor это требование нормы. Несовпадение не блокирует распределение,
 * но возвращается предупреждением — формулировки профилей в договорах
 * не унифицированы.
 */
export async function savePlacement(
  input: SavePlacementInput
): Promise<Result<{ id: string; warnings: string[] }>> {
  const actor = await requirePermission('enrollment:manage');
  const parsed = placementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, studentId, baseId, slotId, periodId, supervisorId, startsOn, endsOn, credits, ...rest } =
    parsed.data;

  if (new Date(endsOn) < new Date(startsOn)) {
    return fail('Дата окончания не может быть раньше даты начала.');
  }

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      minorProgramId: true,
      // Профиль основной программы: направление подготовки в карточке ОП
      // пока не заведено (F-ORG-04, этап 1), поэтому берётся наименование
      program: { select: { nameRu: true } },
    },
  });
  if (!student) return fail('Обучающийся не найден.');

  let warnings: string[] = [];
  let isMajorProfile = true;

  if (baseId) {
    const base = await prisma.practiceBase.findUnique({
      where: { id: baseId },
      select: {
        profileNote: true,
        capacity: true,
        isActive: true,
        _count: {
          select: {
            placements: {
              where: {
                status: { in: ['PLANNED', 'IN_PROGRESS', 'REPORT_SUBMITTED'] },
                id: id ? { not: id } : undefined,
              },
            },
          },
        },
      },
    });
    if (!base) return fail('База практики не найдена.');
    if (!base.isActive) return fail('База практики не действует — договор закрыт.');

    const issues = checkPlacement({
      majorProfile: student.program.nameRu,
      hasMinor: student.minorProgramId != null,
      baseProfile: base.profileNote,
      freeCapacity: base.capacity == null ? null : base.capacity - base._count.placements,
    });

    const blocking = issues.find((i) => i.level === 'ERROR');
    if (blocking) return fail(blocking.message);

    warnings = issues.filter((i) => i.level === 'WARNING').map((i) => i.message);
    isMajorProfile = warnings.length === 0;
  }

  const data = {
    studentId,
    baseId: baseId || null,
    slotId: slotId || null,
    periodId: periodId || null,
    supervisorId: supervisorId || null,
    startsOn: new Date(startsOn),
    endsOn: new Date(endsOn),
    credits: new Prisma.Decimal(credits),
    isMajorProfile,
    ...rest,
  };

  const saved = id
    ? await prisma.practicePlacement.update({ where: { id }, data, select: { id: true } })
    : await prisma.practicePlacement.create({ data, select: { id: true } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.PLACEMENT_SAVE,
    entityType: 'PracticePlacement',
    entityId: saved.id,
    newValue: { studentId, baseId: baseId ?? null, kind: rest.kind, credits },
  });

  revalidate();
  return { ok: true, data: { id: saved.id, warnings } };
}

export async function setPlacementStatus(
  id: string,
  status: 'PLANNED' | 'IN_PROGRESS' | 'REPORT_SUBMITTED' | 'GRADED' | 'CANCELLED'
): Promise<Result> {
  await requirePermission('enrollment:manage');
  await prisma.practicePlacement.update({ where: { id }, data: { status } });
  revalidate();
  return { ok: true };
}

// ── Дневник практики (F-PRC-04) ─────────────────────────────────────────────

const diarySchema = z.object({
  placementId: z.string().trim().min(1),
  entryDate: z.string().trim().min(1, 'Укажите дату.'),
  content: z.string().trim().min(5, 'Опишите выполненную работу.').max(4000),
  hours: z.coerce.number().min(0).max(24).optional(),
});

/** Запись дневника ведёт обучающийся; руководитель её проверяет */
export async function saveDiaryEntry(input: z.input<typeof diarySchema>): Promise<Result> {
  const user = await requireUser();
  const parsed = diarySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { placementId, entryDate, content, hours } = parsed.data;

  const placement = await prisma.practicePlacement.findUnique({
    where: { id: placementId },
    select: { status: true, student: { select: { userId: true } } },
  });
  if (!placement) return fail('Распределение на практику не найдено.');
  if (placement.student.userId !== user.id) {
    throw new AccessError('Дневник практики ведёт сам обучающийся.');
  }
  if (placement.status === 'GRADED' || placement.status === 'CANCELLED') {
    return fail('Практика завершена — дневник больше не редактируется.');
  }

  await prisma.practiceDiaryEntry.upsert({
    where: { placementId_entryDate: { placementId, entryDate: new Date(entryDate) } },
    create: {
      placementId,
      entryDate: new Date(entryDate),
      content,
      hours: hours != null ? new Prisma.Decimal(hours) : null,
    },
    update: {
      content,
      hours: hours != null ? new Prisma.Decimal(hours) : null,
      // Правка записи снимает прежнюю отметку проверки: руководитель
      // проверял другой текст
      reviewedById: null,
      reviewedAt: null,
    },
  });

  // Первая запись переводит практику в состояние «идёт»
  if (placement.status === 'PLANNED') {
    await prisma.practicePlacement.update({
      where: { id: placementId },
      data: { status: 'IN_PROGRESS' },
    });
  }

  revalidate();
  return { ok: true };
}

const reviewSchema = z.object({
  entryId: z.string().trim().min(1),
  comment: z.string().trim().max(1000).optional(),
});

export async function reviewDiaryEntry(input: z.input<typeof reviewSchema>): Promise<Result> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail('Проверьте поля.');
  const { entryId, comment } = parsed.data;

  const entry = await prisma.practiceDiaryEntry.findUnique({
    where: { id: entryId },
    select: { placement: { select: { supervisorId: true } } },
  });
  if (!entry) return fail('Запись не найдена.');
  if (entry.placement.supervisorId !== user.id && !hasRole(user, 'ADMIN', 'REGISTRAR')) {
    throw new AccessError('Проверяет дневник руководитель практики от вуза.');
  }

  await prisma.practiceDiaryEntry.update({
    where: { id: entryId },
    data: { reviewedById: user.id, reviewedAt: new Date(), comment: comment || null },
  });

  revalidate();
  return { ok: true };
}

// ── Отчёт по практике (F-PRC-04) ────────────────────────────────────────────

const reportSchema = z.object({
  placementId: z.string().trim().min(1),
  reviewUniv: z.string().trim().max(4000).optional(),
  reviewBase: z.string().trim().max(4000).optional(),
  score: z.coerce.number().min(0).max(100).optional(),
});

/**
 * Оценка отчёта по практике.
 *
 * Оценка выставляется руководителем от вуза с учётом отзыва организации;
 * при её выставлении практика считается завершённой и её кредиты входят
 * в общий прогресс (F-PRC-05).
 */
export async function gradePracticeReport(
  input: z.input<typeof reportSchema>
): Promise<Result> {
  const user = await requireUser();
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { placementId, reviewUniv, reviewBase, score } = parsed.data;

  const placement = await prisma.practicePlacement.findUnique({
    where: { id: placementId },
    select: { supervisorId: true, studentId: true },
  });
  if (!placement) return fail('Распределение не найдено.');
  if (placement.supervisorId !== user.id && !hasRole(user, 'ADMIN', 'REGISTRAR')) {
    throw new AccessError('Оценивает отчёт руководитель практики от вуза.');
  }

  const band = score != null ? letterForScore(score, STANDARD_GRADE_SCALE) : null;

  await prisma.$transaction(async (tx) => {
    await tx.practiceReport.upsert({
      where: { placementId },
      create: {
        placementId,
        submittedAt: new Date(),
        reviewUniv: reviewUniv || null,
        reviewBase: reviewBase || null,
        score: score != null ? new Prisma.Decimal(score) : null,
        letter: band?.letter ?? null,
        gradedById: score != null ? user.id : null,
        gradedAt: score != null ? new Date() : null,
      },
      update: {
        reviewUniv: reviewUniv || null,
        reviewBase: reviewBase || null,
        score: score != null ? new Prisma.Decimal(score) : null,
        letter: band?.letter ?? null,
        gradedById: score != null ? user.id : null,
        gradedAt: score != null ? new Date() : null,
      },
    });

    await tx.practicePlacement.update({
      where: { id: placementId },
      data: { status: score != null ? 'GRADED' : 'REPORT_SUBMITTED' },
    });
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.PRACTICE_GRADE,
    entityType: 'PracticePlacement',
    entityId: placementId,
    newValue: { score: score ?? null, letter: band?.letter ?? null },
  });

  revalidate();
  return { ok: true };
}

// ── Аттестационная комиссия (F-FIN-01) ──────────────────────────────────────

const committeeSchema = z.object({
  id: z.string().trim().optional(),
  programId: z.string().trim().min(1, 'Выберите образовательную программу.'),
  academicYearId: z.string().trim().min(1, 'Выберите учебный год.'),
  nameRu: z.string().trim().min(1, 'Укажите наименование комиссии.').max(300),
  chairId: z.string().trim().optional(),
  orderNo: z.string().trim().max(100).optional(),
  validFrom: z.string().trim().optional(),
  validTo: z.string().trim().optional(),
  memberIds: z.array(z.string().trim().min(1)).max(30).default([]),
});

export async function saveCommittee(
  input: z.input<typeof committeeSchema>
): Promise<Result<{ id: string }>> {
  const actor = await requirePermission('period:manage');
  const parsed = committeeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, memberIds, chairId, validFrom, validTo, ...rest } = parsed.data;

  const data = {
    ...rest,
    chairId: chairId || null,
    validFrom: validFrom ? new Date(validFrom) : null,
    validTo: validTo ? new Date(validTo) : null,
  };

  const committee = await prisma.$transaction(async (tx) => {
    const c = id
      ? await tx.attestationCommittee.update({ where: { id }, data, select: { id: true } })
      : await tx.attestationCommittee.create({ data, select: { id: true } });

    await tx.committeeMember.deleteMany({ where: { committeeId: c.id } });
    const rows = [
      ...(chairId ? [{ committeeId: c.id, userId: chairId, role: 'CHAIR' as const }] : []),
      ...memberIds
        .filter((u) => u !== chairId)
        .map((userId) => ({ committeeId: c.id, userId, role: 'MEMBER' as const })),
    ];
    if (rows.length > 0) {
      await tx.committeeMember.createMany({ data: rows, skipDuplicates: true });
    }
    return c;
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.COMMITTEE_SAVE,
    entityType: 'AttestationCommittee',
    entityId: committee.id,
    newValue: { nameRu: rest.nameRu, members: memberIds.length, orderNo: rest.orderNo },
  });

  revalidate();
  return { ok: true, data: { id: committee.id } };
}

// ── Дипломная работа (F-FIN-02) ─────────────────────────────────────────────

const thesisSchema = z.object({
  id: z.string().trim().optional(),
  studentId: z.string().trim().min(1),
  titleRu: z.string().trim().min(5, 'Укажите тему работы.').max(500),
  titleKk: z.string().trim().max(500).optional(),
  titleEn: z.string().trim().max(500).optional(),
  isProject: z.coerce.boolean().default(false),
  supervisorId: z.string().trim().optional(),
  departmentId: z.string().trim().optional(),
  approvedOrderNo: z.string().trim().max(100).optional(),
  status: z
    .enum(['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'ADMITTED', 'DEFENDED', 'FAILED'])
    .default('ASSIGNED'),
  originalityPct: z.coerce.number().min(0).max(100).optional(),
});

export async function saveThesis(input: z.input<typeof thesisSchema>): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = thesisSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, supervisorId, departmentId, originalityPct, ...rest } = parsed.data;

  const data = {
    ...rest,
    supervisorId: supervisorId || null,
    departmentId: departmentId || null,
    originalityPct: originalityPct != null ? new Prisma.Decimal(originalityPct) : null,
  };

  const saved = id
    ? await prisma.thesis.update({ where: { id }, data, select: { id: true } })
    : await prisma.thesis.create({ data, select: { id: true } });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.THESIS_SAVE,
    entityType: 'Thesis',
    entityId: saved.id,
    newValue: { titleRu: rest.titleRu, status: rest.status },
  });

  revalidate();
  return { ok: true };
}

// ── Итоговая аттестация (F-FIN-03, F-FIN-05, F-FIN-06) ──────────────────────

const scheduleSchema = z.object({
  studentId: z.string().trim().min(1),
  committeeId: z.string().trim().min(1, 'Выберите аттестационную комиссию.'),
  form: z.enum(['THESIS_DEFENSE', 'COMPLEX_EXAM']),
  thesisId: z.string().trim().optional(),
  scheduledAt: z.string().trim().min(1, 'Укажите дату и время.'),
});

/**
 * F-FIN-06. Назначение итоговой аттестации.
 *
 * Повторное назначение после проведённой аттестации запрещено: повторная
 * сдача для повышения оценки не допускается, а пересдача при
 * «неудовлетворительно» в тот же период не разрешается.
 */
export async function scheduleAttestation(
  input: z.input<typeof scheduleSchema>
): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { studentId, committeeId, form, thesisId, scheduledAt } = parsed.data;

  const existing = await prisma.finalAttestation.findUnique({
    where: { studentId },
    select: { heldAt: true, isPassed: true },
  });
  const check = canScheduleAttestation(existing);
  if (!check.allowed) return fail(check.reason ?? 'Назначение невозможно.');

  await prisma.finalAttestation.upsert({
    where: { studentId },
    create: {
      studentId,
      committeeId,
      form,
      thesisId: thesisId || null,
      scheduledAt: new Date(scheduledAt),
    },
    update: {
      committeeId,
      form,
      thesisId: thesisId || null,
      scheduledAt: new Date(scheduledAt),
    },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ATTESTATION_SCHEDULE,
    entityType: 'FinalAttestation',
    entityId: studentId,
    newValue: { form, committeeId, scheduledAt },
  });

  revalidate();
  return { ok: true };
}

const protocolSchema = z.object({
  studentId: z.string().trim().min(1),
  percent: z.coerce.number().min(0).max(100),
  protocolNo: z.string().trim().min(1, 'Укажите номер протокола.').max(100),
  degreeAwarded: z.coerce.boolean().default(false),
});

/**
 * F-FIN-05. Протокол заседания комиссии: оценка и решение о степени.
 *
 * Неудовлетворительная оценка — основание для отчисления, поэтому решение
 * о присуждении степени при ней не принимается.
 */
export async function recordProtocol(input: z.input<typeof protocolSchema>): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = protocolSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { studentId, percent, protocolNo, degreeAwarded } = parsed.data;

  const attestation = await prisma.finalAttestation.findUnique({
    where: { studentId },
    select: { id: true, heldAt: true, thesisId: true },
  });
  if (!attestation) return fail('Итоговая аттестация не назначена.');
  if (attestation.heldAt) return fail('Протокол уже внесён. Изменение оценки не допускается.');

  const band = letterForScore(percent, STANDARD_GRADE_SCALE);
  const passed = band.isPassing;

  await prisma.$transaction(async (tx) => {
    await tx.finalAttestation.update({
      where: { studentId },
      data: {
        heldAt: new Date(),
        percent: new Prisma.Decimal(percent),
        letter: band.letter,
        gpaPoints: new Prisma.Decimal(band.gpaPoints),
        isPassed: passed,
        protocolNo,
        // Степень присуждается только при сданной аттестации
        degreeAwarded: passed && degreeAwarded,
      },
    });

    if (attestation.thesisId) {
      await tx.thesis.update({
        where: { id: attestation.thesisId },
        data: { status: passed ? 'DEFENDED' : 'FAILED' },
      });
    }

    // Сданная аттестация с присуждением степени завершает обучение;
    // несданная — основание для отчисления (Типовые правила, п. 47)
    if (passed && degreeAwarded) {
      await tx.studentProfile.update({
        where: { id: studentId },
        data: { status: 'GRADUATED' },
      });
      await tx.studentStatusHistory.create({
        data: {
          studentId,
          status: 'GRADUATED',
          reasonCode: 'COMPLETION',
          reasonText: `Протокол ИА № ${protocolNo}`,
          startsOn: new Date(),
          createdById: actor.id,
        },
      });
    }
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ATTESTATION_PROTOCOL,
    entityType: 'FinalAttestation',
    entityId: studentId,
    newValue: { percent, letter: band.letter, passed, protocolNo, degreeAwarded },
  });

  revalidate();
  return { ok: true };
}

// ── Диплом (F-FIN-07) ───────────────────────────────────────────────────────

const diplomaSchema = z.object({
  studentId: z.string().trim().min(1),
  number: z.string().trim().max(100).optional(),
  qrCode: z.string().trim().max(500).optional(),
  issuedOn: z.string().trim().optional(),
});

/**
 * F-FIN-07. Формирование диплома с приложением.
 *
 * Приложение к диплому — зафиксированный транскрипт: выданный документ
 * не должен меняться задним числом вслед за пересчётом оценок.
 * Признак «с отличием» берётся из проверки R-18, а не проставляется вручную.
 */
export async function issueDiploma(input: z.input<typeof diplomaSchema>): Promise<Result> {
  const actor = await requirePermission('period:manage');
  const parsed = diplomaSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { studentId, number, qrCode, issuedOn } = parsed.data;

  const attestation = await prisma.finalAttestation.findUnique({
    where: { studentId },
    select: { isPassed: true, degreeAwarded: true, protocolNo: true },
  });
  const check = canIssueDiploma(attestation);
  if (!check.allowed) return fail(check.reason ?? 'Диплом не может быть сформирован.');

  const existing = await prisma.diploma.findUnique({
    where: { studentId },
    select: { id: true },
  });
  if (existing) return fail('Диплом уже сформирован.');

  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      program: { select: { nameRu: true, nameKk: true, nameEn: true } },
      gpaRecords: { where: { scope: 'CUMULATIVE' }, take: 1 },
    },
  });

  const honours = await honoursReport(studentId);

  // Приложение к диплому: состав записей фиксируется на момент выдачи
  const grades = await prisma.periodGrade.findMany({
    where: { studentId, isFinalized: true },
    select: {
      letter: true,
      finalScore: true,
      gpaPoints: true,
      course: {
        select: { discipline: { select: { code: true, nameRu: true, credits: true } } },
      },
    },
  });

  const gpa = student.gpaRecords[0] ? dec(student.gpaRecords[0].gpa) : null;
  const creditsTotal = grades.reduce((a, g) => a + g.course.discipline.credits, 0);

  const supplement = await prisma.transcript.create({
    data: {
      studentId,
      kind: 'DIPLOMA_SUPPLEMENT',
      number: `ПРИЛ-${Date.now().toString(36).toUpperCase()}`,
      issuedById: actor.id,
      gpa: gpa != null ? new Prisma.Decimal(gpa) : null,
      creditsTotal: new Prisma.Decimal(creditsTotal),
      payload: grades.map((g) => ({
        code: g.course.discipline.code,
        name: g.course.discipline.nameRu,
        credits: g.course.discipline.credits,
        score: g.finalScore ? dec(g.finalScore) : null,
        letter: g.letter,
        gpaPoints: g.gpaPoints ? dec(g.gpaPoints) : null,
      })) as never,
    },
    select: { id: true },
  });

  await prisma.diploma.create({
    data: {
      studentId,
      number: number || null,
      qrCode: qrCode || null,
      issuedOn: issuedOn ? new Date(issuedOn) : new Date(),
      withHonours: honours.eligible,
      degreeRu: student.program.nameRu,
      degreeKk: student.program.nameKk,
      degreeEn: student.program.nameEn,
      gpa: gpa != null ? new Prisma.Decimal(gpa) : null,
      supplementId: supplement.id,
    },
  });

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.DIPLOMA_ISSUE,
    entityType: 'Diploma',
    entityId: studentId,
    newValue: { number: number ?? null, withHonours: honours.eligible, gpa },
  });

  revalidate();
  return { ok: true };
}
