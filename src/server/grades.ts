import 'server-only';
import { prisma, dec, decOrNull } from '@/lib/prisma';
import { getGradeConfig } from './settings';
import {
  calculateFinalGrade,
  calculateControlPeriodScore,
  type GradeScaleRow,
  type ControlPeriodCode,
} from '@/domain/grading';
import { calculateGpa, type GpaEntry } from '@/domain/gpa';
import { AUDIT_ACTIONS, writeAudit } from './audit';

/**
 * Сервис оценивания — разделы 4.3, 5.3, 5.4 ТЗ.
 * Критерии приёмки № 5, 6, 13.
 */

/** Шкала оценивания из БД (справочник неизменяем, раздел 2.3) */
export async function loadGradeScale(profile: 'STANDARD' | 'LANGUAGE'): Promise<GradeScaleRow[]> {
  const scale = await prisma.gradeScale.findUnique({
    where: { code: profile },
    include: { items: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!scale) throw new Error(`Шкала оценивания «${profile}» не загружена в справочник.`);
  return scale.items.map((i) => ({
    letter: i.letter,
    gpaPoints: dec(i.gpaPoints),
    minPercent: i.minPercent,
    maxPercent: i.maxPercent,
    traditionalKk: i.traditionalKk,
    traditionalRu: i.traditionalRu,
    traditionalEn: i.traditionalEn,
    ects: i.ects,
    cefr: i.cefr,
    isPassing: i.isPassing,
  }));
}

/**
 * Пересчёт итогов студента по курсу: РК1, РК2, допуск, экзамен, итог, буква.
 * Вызывается после любого изменения балла.
 */
export async function recalculatePeriodGrade(
  courseId: string,
  studentId: string,
  actorId?: string
): Promise<void> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: {
      id: true,
      periodId: true,
      disciplineId: true,
      discipline: { select: { gradingProfile: true, credits: true } },
    },
  });

  const config = await getGradeConfig({ disciplineId: course.disciplineId, courseId });
  const scale = await loadGradeScale(course.discipline.gradingProfile);

  const items = await prisma.gradeItem.findMany({
    where: { courseId },
    include: { grades: { where: { studentId } } },
  });

  const scoreFor = (period: ControlPeriodCode) =>
    calculateControlPeriodScore(
      items
        .filter((i) => i.controlPeriod === period)
        .map((i) => ({
          score: i.grades[0] ? dec(i.grades[0].score) : 0,
          maxScore: dec(i.maxScore),
          weight: dec(i.weight),
        }))
    );

  // Балл периода считается только если по нему выставлено хотя бы одно мероприятие
  const hasGrades = (period: ControlPeriodCode) =>
    items.some((i) => i.controlPeriod === period && i.grades.length > 0);

  const rk1 = hasGrades('RK1') ? scoreFor('RK1') : null;
  const rk2 = config.midtermCount >= 2 ? (hasGrades('RK2') ? scoreFor('RK2') : null) : null;
  const exam = hasGrades('EXAM') ? scoreFor('EXAM') : null;

  const midterms = config.midtermCount >= 2 ? [rk1, rk2] : [rk1];

  const result = calculateFinalGrade({ midterms, examScore: exam, config, scale });

  const previous = await prisma.periodGrade.findUnique({
    where: { courseId_studentId: { courseId, studentId } },
  });

  const data = {
    rk1: rk1,
    rk2: rk2,
    admissionScore: result.admissionScore,
    isAdmitted: result.isAdmitted,
    examScore: exam,
    finalScore: result.finalScore,
    letter: result.letter,
    gpaPoints: result.gpaPoints,
    traditional: result.traditionalRu,
    ects: result.ects,
    cefr: (result.cefr as never) ?? null,
    calculatedAt: new Date(),
  };

  await prisma.periodGrade.upsert({
    where: { courseId_studentId: { courseId, studentId } },
    create: { courseId, studentId, periodId: course.periodId, ...data },
    update: data,
  });

  if (previous && previous.letter !== result.letter) {
    await writeAudit({
      actorId,
      action: AUDIT_ACTIONS.PERIOD_GRADE_RECALC,
      entityType: 'PeriodGrade',
      entityId: `${courseId}:${studentId}`,
      oldValue: { letter: previous.letter, finalScore: decOrNull(previous.finalScore) },
      newValue: { letter: result.letter, finalScore: result.finalScore },
    });
  }

  await recalculateGpa(studentId);
}

/** Пересчёт GPA: за период, за учебный год, накопительный (раздел 4.3) */
export async function recalculateGpa(studentId: string): Promise<void> {
  const grades = await prisma.periodGrade.findMany({
    where: { studentId, gpaPoints: { not: null } },
    include: {
      course: {
        select: {
          discipline: { select: { credits: true } },
          period: { select: { id: true, academicYearId: true } },
        },
      },
    },
  });

  const entries: GpaEntry[] = grades.map((g) => ({
    gpaPoints: dec(g.gpaPoints),
    credits: g.course.discipline.credits,
    periodId: g.course.period.id,
    academicYearId: g.course.period.academicYearId,
  }));

  // scopeId = '' для накопительного GPA: поле входит в составной уникальный индекс
  const writes: { scope: string; scopeId: string; gpa: number; credits: number }[] = [];

  const cumulative = calculateGpa(entries);
  writes.push({ scope: 'CUMULATIVE', scopeId: '', ...cumulative });

  for (const periodId of new Set(entries.map((e) => e.periodId!).filter(Boolean))) {
    const r = calculateGpa(entries.filter((e) => e.periodId === periodId));
    writes.push({ scope: 'PERIOD', scopeId: periodId, ...r });
  }

  for (const yearId of new Set(entries.map((e) => e.academicYearId!).filter(Boolean))) {
    const r = calculateGpa(entries.filter((e) => e.academicYearId === yearId));
    writes.push({ scope: 'YEAR', scopeId: yearId, ...r });
  }

  await prisma.$transaction(
    writes.map((w) =>
      prisma.gpaRecord.upsert({
        where: {
          studentId_scope_scopeId: { studentId, scope: w.scope, scopeId: w.scopeId },
        },
        create: {
          studentId,
          scope: w.scope,
          scopeId: w.scopeId,
          gpa: w.gpa,
          credits: w.credits,
        },
        update: { gpa: w.gpa, credits: w.credits, calculatedAt: new Date() },
      })
    )
  );
}

/** Выставление / изменение балла с записью в журнал аудита (критерий приёмки № 13) */
export async function setGrade(params: {
  gradeItemId: string;
  studentId: string;
  score: number;
  comment?: string;
  actorId: string;
  actorEmail: string;
  reason?: string;
}): Promise<void> {
  const item = await prisma.gradeItem.findUniqueOrThrow({
    where: { id: params.gradeItemId },
    select: { courseId: true, maxScore: true, title: true },
  });

  const maxScore = dec(item.maxScore);
  if (params.score < 0 || params.score > maxScore) {
    throw new Error(`Балл должен быть в диапазоне 0…${maxScore}.`);
  }

  const existing = await prisma.grade.findUnique({
    where: {
      gradeItemId_studentId: { gradeItemId: params.gradeItemId, studentId: params.studentId },
    },
  });

  await prisma.grade.upsert({
    where: {
      gradeItemId_studentId: { gradeItemId: params.gradeItemId, studentId: params.studentId },
    },
    create: {
      gradeItemId: params.gradeItemId,
      studentId: params.studentId,
      score: params.score,
      comment: params.comment,
      gradedById: params.actorId,
    },
    update: {
      score: params.score,
      comment: params.comment,
      gradedById: params.actorId,
    },
  });

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: existing ? AUDIT_ACTIONS.GRADE_UPDATE : AUDIT_ACTIONS.GRADE_CREATE,
    entityType: 'Grade',
    entityId: `${params.gradeItemId}:${params.studentId}`,
    oldValue: existing ? { score: dec(existing.score) } : null,
    newValue: { score: params.score, item: item.title },
    reason: params.reason,
  });

  await recalculatePeriodGrade(item.courseId, params.studentId, params.actorId);

  // Уведомление о выставленной оценке (F-S-10)
  const student = await prisma.studentProfile.findUnique({
    where: { id: params.studentId },
    select: { userId: true },
  });
  if (student) {
    await prisma.notification.create({
      data: {
        userId: student.userId,
        type: 'GRADE_POSTED',
        title: `Выставлен балл: ${item.title}`,
        body: `${params.score} из ${maxScore}`,
        link: `/my/courses/${item.courseId}`,
      },
    });
  }
}

/** Сводный журнал курса: студенты × оценочные мероприятия (F-T-12) */
export async function loadGradebook(courseId: string) {
  const [course, items, enrollments] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        disciplineId: true,
        discipline: { select: { nameRu: true, credits: true, gradingProfile: true } },
      },
    }),
    prisma.gradeItem.findMany({
      where: { courseId },
      orderBy: [{ controlPeriod: 'asc' }, { orderIndex: 'asc' }],
      include: { grades: true },
    }),
    prisma.enrollment.findMany({
      where: { courseId, cancelledAt: null },
      include: {
        student: {
          select: {
            id: true,
            user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } },
            group: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const periodGrades = await prisma.periodGrade.findMany({ where: { courseId } });
  const pgMap = new Map(periodGrades.map((p) => [p.studentId, p]));

  const rows = enrollments
    .map((e) => {
      const pg = pgMap.get(e.student.id);
      return {
        studentId: e.student.id,
        fullName: [
          e.student.user.lastNameRu,
          e.student.user.firstNameRu,
          e.student.user.middleNameRu,
        ]
          .filter(Boolean)
          .join(' '),
        group: e.student.group?.name ?? '',
        scores: Object.fromEntries(
          items.map((i) => [i.id, decOrNull(i.grades.find((g) => g.studentId === e.student.id)?.score)])
        ) as Record<string, number | null>,
        rk1: decOrNull(pg?.rk1),
        rk2: decOrNull(pg?.rk2),
        admissionScore: decOrNull(pg?.admissionScore),
        isAdmitted: pg?.isAdmitted ?? false,
        examScore: decOrNull(pg?.examScore),
        finalScore: decOrNull(pg?.finalScore),
        letter: pg?.letter ?? null,
        gpaPoints: decOrNull(pg?.gpaPoints),
        traditional: pg?.traditional ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  const sheets = await prisma.gradeSheet.findMany({ where: { courseId } });

  return {
    course,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      controlPeriod: i.controlPeriod,
      maxScore: dec(i.maxScore),
      weight: dec(i.weight),
      isAutoGraded: i.isAutoGraded,
    })),
    rows,
    sheets: sheets.map((s) => ({
      controlPeriod: s.controlPeriod,
      status: s.status,
      closedAt: s.closedAt,
    })),
  };
}

/** Закрытие ведомости (F-A-05) */
export async function closeGradeSheet(params: {
  courseId: string;
  controlPeriod: ControlPeriodCode;
  actorId: string;
  actorEmail: string;
}): Promise<void> {
  const number = `${params.courseId.slice(-6).toUpperCase()}-${params.controlPeriod}`;

  const sheet = await prisma.gradeSheet.upsert({
    where: {
      courseId_controlPeriod: {
        courseId: params.courseId,
        controlPeriod: params.controlPeriod,
      },
    },
    create: {
      courseId: params.courseId,
      controlPeriod: params.controlPeriod,
      number,
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: params.actorId,
    },
    update: { status: 'CLOSED', closedAt: new Date(), closedById: params.actorId },
  });

  // Итоговые оценки фиксируются и становятся неизменяемыми
  if (params.controlPeriod === 'EXAM') {
    await prisma.periodGrade.updateMany({
      where: { courseId: params.courseId },
      data: { isFinalized: true },
    });
  }

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: AUDIT_ACTIONS.GRADESHEET_CLOSE,
    entityType: 'GradeSheet',
    entityId: sheet.id,
    newValue: { courseId: params.courseId, controlPeriod: params.controlPeriod },
  });
}

/** Открытие закрытой ведомости — только с указанием основания */
export async function reopenGradeSheet(params: {
  courseId: string;
  controlPeriod: ControlPeriodCode;
  reason: string;
  actorId: string;
  actorEmail: string;
}): Promise<void> {
  if (params.reason.trim().length < 10) {
    throw new Error('Требуется указать основание (не менее 10 символов).');
  }

  const sheet = await prisma.gradeSheet.update({
    where: {
      courseId_controlPeriod: {
        courseId: params.courseId,
        controlPeriod: params.controlPeriod,
      },
    },
    data: { status: 'DRAFT', reopenReason: params.reason },
  });

  if (params.controlPeriod === 'EXAM') {
    await prisma.periodGrade.updateMany({
      where: { courseId: params.courseId },
      data: { isFinalized: false },
    });
  }

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: AUDIT_ACTIONS.GRADESHEET_REOPEN,
    entityType: 'GradeSheet',
    entityId: sheet.id,
    oldValue: { status: 'CLOSED' },
    newValue: { status: 'DRAFT' },
    reason: params.reason,
  });
}

/** Транскрипт студента за все периоды обучения (F-S-09) */
export async function loadTranscript(studentId: string) {
  const grades = await prisma.periodGrade.findMany({
    where: { studentId },
    include: {
      course: {
        select: {
          discipline: {
            select: { code: true, nameKk: true, nameRu: true, nameEn: true, credits: true },
          },
          period: {
            select: {
              id: true,
              name: true,
              ordinal: true,
              academicYear: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ period: { startDate: 'asc' } }],
  });

  const gpaRecords = await prisma.gpaRecord.findMany({ where: { studentId } });
  const gpaByScope = new Map(gpaRecords.map((r) => [`${r.scope}:${r.scopeId}`, r]));

  const byPeriod = new Map<
    string,
    {
      periodId: string;
      periodName: string;
      yearName: string;
      rows: {
        code: string;
        nameKk: string;
        nameRu: string;
        nameEn: string;
        credits: number;
        finalScore: number | null;
        letter: string | null;
        gpaPoints: number | null;
        traditional: string | null;
      }[];
      gpa: number;
      credits: number;
    }
  >();

  for (const g of grades) {
    const key = g.course.period.id;
    if (!byPeriod.has(key)) {
      const rec = gpaByScope.get(`PERIOD:${key}`);
      byPeriod.set(key, {
        periodId: key,
        periodName: g.course.period.name,
        yearName: g.course.period.academicYear.name,
        rows: [],
        gpa: rec ? dec(rec.gpa) : 0,
        credits: rec?.credits ?? 0,
      });
    }
    byPeriod.get(key)!.rows.push({
      code: g.course.discipline.code,
      nameKk: g.course.discipline.nameKk,
      nameRu: g.course.discipline.nameRu,
      nameEn: g.course.discipline.nameEn,
      credits: g.course.discipline.credits,
      finalScore: decOrNull(g.finalScore),
      letter: g.letter,
      gpaPoints: decOrNull(g.gpaPoints),
      traditional: g.traditional,
    });
  }

  const cumulative = gpaByScope.get('CUMULATIVE:');

  return {
    periods: [...byPeriod.values()],
    cumulativeGpa: cumulative ? dec(cumulative.gpa) : 0,
    totalCredits: cumulative?.credits ?? 0,
  };
}
