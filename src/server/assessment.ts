import 'server-only';
import { Prisma } from '@prisma/client';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { checkHonours, checkPromotion, summarizeTransfers } from '@/domain/honours';
import { calculateGpa, type GpaEntry } from '@/domain/gpa';
import { getSetting } from '@/server/settings';
import { SETTINGS } from '@/domain/constants';

/**
 * Оценивание — чтение. Раздел 4.7 ТЗ.
 *
 * Здесь собирается всё, что нужно для проверки на диплом с отличием (R-18),
 * переводного балла (F-ASM-07) и перезачёта кредитов (F-ASM-10).
 */

/** Переводной балл — порог GPA для перевода на следующий курс (F-ASM-07) */
export async function promotionThreshold(): Promise<number> {
  const value = Number(await getSetting(SETTINGS.PROMOTION_GPA));
  return Number.isFinite(value) ? value : 2.0;
}

/**
 * Итоговые оценки обучающегося вместе с циклом позиции плана.
 *
 * Цикл берётся из позиции учебного плана через строку ИУП, а не из
 * справочника дисциплин: в справочнике у дисциплины один цикл на все
 * программы, а нормативно значим цикл в конкретном плане (ДВО и ИА
 * в проверку на отличие не входят).
 */
export async function loadFinalGrades(studentId: string) {
  const grades = await prisma.periodGrade.findMany({
    where: { studentId, isFinalized: true },
    select: {
      id: true,
      letter: true,
      gpaPoints: true,
      finalScore: true,
      retakeCount: true,
      course: {
        select: {
          id: true,
          disciplineId: true,
          discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true, credits: true } },
          period: { select: { id: true, name: true, academicYearId: true } },
        },
      },
    },
    orderBy: { calculatedAt: 'asc' },
  });

  const [enrollments, iepItems] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId },
      select: { courseId: true, attemptNo: true },
    }),
    prisma.iepItem.findMany({
      where: { iep: { studentId } },
      select: { disciplineId: true, slot: { select: { cycle: true } } },
    }),
  ]);

  const attemptByCourse = new Map<string, number>();
  for (const e of enrollments) {
    attemptByCourse.set(e.courseId, Math.max(attemptByCourse.get(e.courseId) ?? 1, e.attemptNo));
  }
  const cycleByDiscipline = new Map(iepItems.map((i) => [i.disciplineId, i.slot.cycle]));

  return grades.map((g) => ({
    ...g,
    attemptNo: attemptByCourse.get(g.course.id) ?? 1,
    // Дисциплина без строки ИУП (заведена импортом или вручную) считается
    // базовой: исключать её из проверки на отличие оснований нет
    cycle: cycleByDiscipline.get(g.course.disciplineId) ?? ('BD' as const),
  }));
}

/**
 * F-ASM-09, R-18. Проверка обучающегося на диплом с отличием.
 * Возвращает разбор по каждому из четырёх условий пункта 50.
 */
export async function honoursReport(studentId: string, locale = 'ru') {
  const grades = await loadFinalGrades(studentId);
  const cumulative = await prisma.gpaRecord.findFirst({
    where: { studentId, scope: 'CUMULATIVE' },
  });
  // Накопительный GPA берётся из записи расчёта, а при её отсутствии — из
  // последнего снимка. Иначе проверка сообщала бы «GPA не рассчитан» там,
  // где он посчитан при закрытии периода или пересмотре оценки по апелляции
  const snapshot = cumulative
    ? null
    : await prisma.gpaSnapshot.findFirst({
        where: { studentId, gpaCumulative: { not: null } },
        orderBy: { computedAt: 'desc' },
        select: { gpaCumulative: true },
      });
  // Итоговая аттестация как дисциплина цикла ИА: отдельный модуль ИА —
  // этап 7, до него оценка ИА берётся из ведомости соответствующей позиции
  const attestation = await prisma.periodGrade.findFirst({
    where: {
      studentId,
      isFinalized: true,
      course: { discipline: { iepItems: { some: { slot: { cycle: 'IA' } } } } },
    },
    select: { letter: true },
    orderBy: { calculatedAt: 'desc' },
  });

  const pick = (d: { nameKk: string; nameRu: string; nameEn: string }) =>
    locale === 'kk' ? d.nameKk : locale === 'en' ? d.nameEn : d.nameRu;

  return checkHonours({
    gpa: cumulative
      ? dec(cumulative.gpa)
      : snapshot?.gpaCumulative
        ? dec(snapshot.gpaCumulative)
        : null,
    finalAttestationLetter: attestation?.letter ?? null,
    entries: grades.map((g) => ({
      disciplineId: g.course.disciplineId,
      disciplineName: pick(g.course.discipline),
      letter: g.letter,
      cycle: g.cycle,
      attemptNo: g.attemptNo,
      retakeCount: g.retakeCount,
    })),
  });
}

/** F-ASM-07. Проверка перевода на следующий курс по итогам учебного года */
export async function promotionReport(studentId: string, academicYearId: string) {
  const [student, yearGpa, threshold, iep] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { studyYear: true },
    }),
    prisma.gpaRecord.findFirst({
      where: { studentId, scope: 'YEAR', scopeId: academicYearId },
    }),
    promotionThreshold(),
    prisma.iep.findUnique({
      where: { studentId_academicYearId: { studentId, academicYearId } },
      select: { totalCredits: true },
    }),
  ]);

  return checkPromotion({
    gpa: yearGpa ? dec(yearGpa.gpa) : null,
    threshold,
    studyYear: student.studyYear,
    creditsEarned: yearGpa?.credits ?? 0,
    creditsPlanned: iep ? dec(iep.totalCredits) : 0,
  });
}

/**
 * F-ASM-06. Снимок GPA на конец академического периода.
 *
 * GPA пересчитывается при каждом изменении оценки, поэтому без снимка
 * нельзя ответить, каким он был на момент перевода на курс или выдачи
 * транскрипта.
 */
export async function makeGpaSnapshot(studentId: string, periodId: string) {
  const period = await prisma.academicPeriod.findUniqueOrThrow({
    where: { id: periodId },
    select: { id: true, academicYearId: true },
  });

  const grades = await prisma.periodGrade.findMany({
    where: { studentId, isFinalized: true },
    select: {
      gpaPoints: true,
      periodId: true,
      course: {
        select: {
          discipline: { select: { credits: true } },
          period: { select: { academicYearId: true } },
        },
      },
    },
  });

  const entries: GpaEntry[] = grades
    .filter((g) => g.gpaPoints != null)
    .map((g) => ({
      credits: g.course.discipline.credits,
      gpaPoints: dec(g.gpaPoints),
      periodId: g.periodId,
      academicYearId: g.course.period.academicYearId,
    }));

  const periodResult = calculateGpa(entries.filter((e) => e.periodId === periodId));
  const cumulative = calculateGpa(entries);

  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentId },
    select: { studyYear: true },
  });

  return prisma.gpaSnapshot.upsert({
    where: { studentId_periodId: { studentId, periodId } },
    create: {
      studentId,
      periodId,
      academicYearId: period.academicYearId,
      gpaPeriod: new Prisma.Decimal(periodResult.gpa),
      gpaCumulative: new Prisma.Decimal(cumulative.gpa),
      creditsPeriod: new Prisma.Decimal(periodResult.credits),
      creditsTotal: new Prisma.Decimal(cumulative.credits),
      studyYear: student.studyYear,
    },
    update: {
      gpaPeriod: new Prisma.Decimal(periodResult.gpa),
      gpaCumulative: new Prisma.Decimal(cumulative.gpa),
      creditsPeriod: new Prisma.Decimal(periodResult.credits),
      creditsTotal: new Prisma.Decimal(cumulative.credits),
      studyYear: student.studyYear,
      computedAt: new Date(),
    },
  });
}

/** Перезачтённые кредиты обучающегося (F-ASM-10) */
export async function loadCreditTransfers(studentId: string) {
  const rows = await prisma.creditTransfer.findMany({
    where: { studentId },
    include: {
      discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
      slot: { select: { slotCode: true, cycle: true, component: true } },
      approvedBy: { select: { lastNameRu: true, firstNameRu: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totals = summarizeTransfers(
    rows.map((r) => ({
      credits: dec(r.credits),
      gpaPoint: decOrNull(r.gpaPoint),
      approved: r.approvedAt != null,
    }))
  );

  return { rows, totals };
}

/** Очередь апелляций (F-ASM-04) */
export async function appealQueue(filter: { studentId?: string; open?: boolean } = {}) {
  return prisma.gradeAppeal.findMany({
    where: {
      studentId: filter.studentId,
      status: filter.open ? { in: ['FILED', 'IN_REVIEW'] } : undefined,
    },
    include: {
      student: {
        select: {
          id: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
        },
      },
      periodGrade: {
        select: {
          finalScore: true,
          letter: true,
          course: {
            select: {
              discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
              period: { select: { name: true } },
            },
          },
        },
      },
      decidedBy: { select: { lastNameRu: true, firstNameRu: true } },
    },
    orderBy: [{ status: 'asc' }, { filedAt: 'asc' }],
  });
}

/** Срок подачи апелляции в днях после закрытия ведомости — настройка вуза */
export async function appealWindowDays(): Promise<number> {
  const value = Number(await getSetting(SETTINGS.APPEAL_WINDOW_DAYS));
  return Number.isFinite(value) ? value : 3;
}
