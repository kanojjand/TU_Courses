import 'server-only';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  buildIepPlan,
  creditsInYear,
  termsForCourse,
  type IepContext,
  type IepPlan,
  type IepSelection,
  type IepSlotSpec,
} from '@/domain/iep';

/**
 * ИУП и регистрация — чтение. Раздел 4.4 ТЗ.
 *
 * Здесь собирается контекст, который нужен чистому модулю `src/domain/iep.ts`:
 * позиции учебного плана студента, освоенные и проваленные дисциплины,
 * лимиты кредитов из окна регистрации.
 */

const dec = (v: Prisma.Decimal | number | null): number =>
  v == null ? 0 : typeof v === 'number' ? v : v.toNumber();

const iepInclude = {
  student: {
    select: {
      id: true,
      studyYear: true,
      admissionYear: true,
      curriculumId: true,
      advisorId: true,
      user: { select: { id: true, lastNameRu: true, firstNameRu: true, middleNameRu: true } },
      program: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
      group: { select: { id: true, name: true } },
    },
  },
  academicYear: { select: { id: true, name: true, startDate: true } },
  curriculum: { select: { id: true, admissionYear: true, version: true, termsCount: true } },
  advisor: { select: { id: true, lastNameRu: true, firstNameRu: true } },
  approvedBy: { select: { id: true, lastNameRu: true, firstNameRu: true } },
  confirmedBy: { select: { id: true, lastNameRu: true, firstNameRu: true } },
  items: {
    include: {
      slot: { select: { id: true, slotCode: true, cycle: true, component: true } },
      discipline: { select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true } },
      registrations: {
        where: { cancelledAt: null },
        select: {
          id: true,
          status: true,
          attemptNo: true,
          waitlistPos: true,
          course: {
            select: {
              id: true,
              slug: true,
              period: { select: { id: true, name: true, ordinal: true } },
            },
          },
        },
      },
    },
    orderBy: [{ termNo: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.IepInclude;

export type IepDetail = Prisma.IepGetPayload<{ include: typeof iepInclude }>;

export async function getIep(id: string): Promise<IepDetail | null> {
  return prisma.iep.findUnique({ where: { id }, include: iepInclude });
}

export async function getStudentIep(
  studentId: string,
  academicYearId: string
): Promise<IepDetail | null> {
  return prisma.iep.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId } },
    include: iepInclude,
  });
}

/**
 * Учебный план, по которому студент формирует ИУП.
 *
 * Приоритет: план, явно закреплённый за студентом, затем план его группы,
 * затем утверждённый план программы за год набора. Последнее — обычный случай:
 * студентов заводят импортом, и вручную план каждому не проставляют.
 */
export async function resolveCurriculumForStudent(studentId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      curriculumId: true,
      programId: true,
      admissionYear: true,
      studyForm: true,
      group: { select: { curriculumId: true } },
    },
  });
  if (!student) return null;

  const explicitId = student.curriculumId ?? student.group?.curriculumId ?? null;
  if (explicitId) {
    return prisma.curriculum.findUnique({ where: { id: explicitId } });
  }

  return prisma.curriculum.findFirst({
    where: {
      programId: student.programId,
      admissionYear: student.admissionYear,
      status: 'APPROVED',
    },
    orderBy: { version: 'desc' },
  });
}

/** Позиции учебного плана в виде, который принимает мастер ИУП */
export async function loadSlotSpecs(curriculumId: string): Promise<IepSlotSpec[]> {
  const slots = await prisma.curriculumSlot.findMany({
    where: { curriculumId },
    include: {
      options: {
        include: {
          discipline: {
            select: {
              id: true,
              code: true,
              nameRu: true,
              // Пререквизиты: рёбра, где текущая дисциплина — источник (R-14)
              prerequisites: { select: { targetId: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  return slots.map((s) => ({
    id: s.id,
    slotCode: s.slotCode,
    cycle: s.cycle,
    component: s.component,
    credits: dec(s.credits),
    terms: s.terms,
    controlTerm: s.controlTerm,
    chooseN: s.chooseN,
    isMinorSlot: s.isMinorSlot,
    options: s.options.map((o) => ({
      disciplineId: o.disciplineId,
      code: o.discipline.code,
      name: o.discipline.nameRu,
      prerequisiteIds: o.discipline.prerequisites.map((p) => p.targetId),
    })),
  }));
}

/**
 * Освоенные и проваленные дисциплины студента — основание для R-14 и R-16.
 * Учитываются только закрытые ведомости: незакрытая оценка может измениться.
 */
export async function loadStudentHistory(studentId: string) {
  const grades = await prisma.periodGrade.findMany({
    where: { studentId, isFinalized: true },
    select: { letter: true, course: { select: { disciplineId: true } } },
  });

  const completed = new Set<string>();
  const failed = new Set<string>();
  for (const g of grades) {
    const id = g.course.disciplineId;
    completed.add(id);
    // F требует повторного изучения дисциплины; FX даёт только пересдачу
    // итогового контроля и новой регистрации не требует (R-16)
    if (g.letter === 'F') failed.add(id);
  }
  return {
    completedDisciplineIds: [...completed],
    failedDisciplineIds: [...failed],
  };
}

/**
 * Окно регистрации, действующее на учебный год.
 * Лимиты кредитов берутся из основного окна: add/drop их не переопределяет.
 */
export async function loadRegistrationLimits(academicYearId: string) {
  const window = await prisma.registrationWindow.findFirst({
    where: { kind: 'MAIN', period: { academicYearId } },
    orderBy: { opensAt: 'asc' },
    select: { minCredits: true, maxCredits: true, opensAt: true, closesAt: true },
  });
  return window;
}

export interface IepWorkspace {
  curriculum: { id: string; admissionYear: number; version: number; termsCount: number };
  terms: number[];
  plan: IepPlan;
  context: IepContext;
  /** Позиции, уже сохранённые в ИУП */
  selections: IepSelection[];
}

/**
 * Полный контекст мастера ИУП: план года набора, история студента,
 * лимиты и текущий выбор.
 */
export async function loadIepWorkspace(params: {
  studentId: string;
  academicYearId: string;
  studyYear: number;
  selections?: IepSelection[];
}): Promise<IepWorkspace | null> {
  const curriculum = await resolveCurriculumForStudent(params.studentId);
  if (!curriculum) return null;

  const [slots, history, window, saved] = await Promise.all([
    loadSlotSpecs(curriculum.id),
    loadStudentHistory(params.studentId),
    loadRegistrationLimits(params.academicYearId),
    prisma.iep.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: params.studentId,
          academicYearId: params.academicYearId,
        },
      },
      select: { items: { select: { slotId: true, disciplineId: true, isRetake: true } } },
    }),
  ]);

  // Мастер работает с семестрами сквозной нумерации учебного плана:
  // на втором курсе это 3 и 4, а не 1 и 2
  const termsPerYear = Math.max(1, Math.round(curriculum.termsCount / 4)) || 2;
  const terms = termsForCourse(params.studyYear, termsPerYear === 0 ? 2 : termsPerYear);

  const selections: IepSelection[] =
    params.selections ??
    (saved?.items.map((i) => ({
      slotId: i.slotId,
      disciplineId: i.disciplineId,
      isRetake: i.isRetake,
    })) ?? []);

  const context: IepContext = {
    terms,
    completedDisciplineIds: history.completedDisciplineIds,
    failedDisciplineIds: history.failedDisciplineIds,
    limits: {
      normCredits: 60,
      minCredits: window?.minCredits ?? null,
      maxCredits: window?.maxCredits ?? null,
    },
  };

  return {
    curriculum: {
      id: curriculum.id,
      admissionYear: curriculum.admissionYear,
      version: curriculum.version,
      termsCount: curriculum.termsCount,
    },
    terms,
    plan: buildIepPlan(slots, selections, context),
    context,
    selections,
  };
}

/** Кредиты позиции, приходящиеся на учебный год — для записи в строку ИУП */
export { creditsInYear };

/**
 * Реализации дисциплины (курсы), на которые можно зарегистрироваться
 * по строке ИУП: тот же предмет в периодах указанного учебного года.
 */
export async function offeringsForDiscipline(disciplineId: string, academicYearId: string) {
  return prisma.course.findMany({
    where: {
      disciplineId,
      period: { academicYearId },
      status: { in: ['APPROVED', 'PUBLISHED'] },
    },
    select: {
      id: true,
      slug: true,
      streamName: true,
      maxEnrollment: true,
      period: { select: { id: true, name: true, ordinal: true, status: true } },
      language: true,
      groups: { select: { groupId: true } },
      discipline: { select: { code: true, nameRu: true, credits: true, language: true } },
      teachers: {
        where: { isLead: true },
        select: { teacher: { select: { user: { select: { lastNameRu: true, firstNameRu: true } } } } },
      },
      _count: { select: { enrollments: { where: { cancelledAt: null, status: 'REGISTERED' } } } },
    },
    orderBy: [{ period: { ordinal: 'asc' } }, { streamName: 'asc' }],
  });
}

/**
 * F-IEP-05. Освободившееся место передаётся первому в листе ожидания.
 *
 * Вызывается отовсюду, где регистрация снимается: и когда студент снимает
 * её сам в окне add/drop, и когда это делает офис Регистратора. Иначе лист
 * ожидания работал бы через раз — место освободилось, а зачислять некому.
 */
export async function promoteFromWaitlist(
  tx: Prisma.TransactionClient,
  courseId: string
): Promise<string | null> {
  const first = await tx.enrollment.findFirst({
    where: { courseId, status: 'WAITLISTED', cancelledAt: null },
    orderBy: { waitlistPos: 'asc' },
    select: { id: true },
  });
  if (!first) return null;

  await tx.enrollment.update({
    where: { id: first.id },
    data: { status: 'REGISTERED', waitlistPos: null },
  });
  // Остальные подтягиваются на позицию вверх
  await tx.enrollment.updateMany({
    where: { courseId, status: 'WAITLISTED', cancelledAt: null },
    data: { waitlistPos: { decrement: 1 } },
  });
  return first.id;
}

/** Очередь ИУП, ожидающих действия эдвайзера или офиса Регистратора */
export async function iepQueue(filter: {
  advisorUserId?: string;
  status?: ('DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONFIRMED')[];
}) {
  return prisma.iep.findMany({
    where: {
      status: filter.status ? { in: filter.status } : undefined,
      advisorId: filter.advisorUserId,
    },
    select: {
      id: true,
      status: true,
      totalCredits: true,
      submittedAt: true,
      academicYear: { select: { name: true } },
      student: {
        select: {
          id: true,
          studyYear: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
          program: { select: { code: true } },
        },
      },
      _count: { select: { items: true } },
    },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  });
}
