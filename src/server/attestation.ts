import 'server-only';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { checkAdmission, practiceCredits, type PracticeKindCode } from '@/domain/attestation';
import { loadCreditTransfers } from '@/server/assessment';

/**
 * Практика и итоговая аттестация — чтение. Разделы 4.8 и 4.9 ТЗ.
 */

/** Реестр баз практики со свободными местами (F-PRC-02) */
export async function loadPracticeBases() {
  const bases = await prisma.practiceBase.findMany({
    include: {
      _count: {
        select: {
          placements: {
            where: { status: { in: ['PLANNED', 'IN_PROGRESS', 'REPORT_SUBMITTED'] } },
          },
        },
      },
    },
    orderBy: [{ isActive: 'desc' }, { nameRu: 'asc' }],
  });

  return bases.map((b) => ({
    ...b,
    occupied: b._count.placements,
    freeCapacity: b.capacity == null ? null : b.capacity - b._count.placements,
  }));
}

/** Распределения на практику с дневниками и отчётами (F-PRC-03, F-PRC-04) */
export async function loadPlacements(filter: { studentId?: string; baseId?: string } = {}) {
  return prisma.practicePlacement.findMany({
    where: { studentId: filter.studentId, baseId: filter.baseId },
    include: {
      student: {
        select: {
          id: true,
          minorProgramId: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
          program: { select: { code: true, nameRu: true } },
        },
      },
      base: { select: { id: true, nameRu: true, profileNote: true } },
      slot: { select: { slotCode: true, credits: true } },
      supervisor: { select: { lastNameRu: true, firstNameRu: true } },
      report: true,
      _count: { select: { diary: true } },
    },
    orderBy: [{ startsOn: 'desc' }],
  });
}

export async function loadPlacement(id: string) {
  return prisma.practicePlacement.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          userId: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
        },
      },
      base: true,
      supervisor: { select: { id: true, lastNameRu: true, firstNameRu: true } },
      report: { include: { gradedBy: { select: { lastNameRu: true, firstNameRu: true } } } },
      diary: {
        include: { reviewedBy: { select: { lastNameRu: true, firstNameRu: true } } },
        orderBy: { entryDate: 'asc' },
      },
    },
  });
}

/**
 * F-FIN-04. Проверка допуска обучающегося к итоговой аттестации.
 *
 * Кредиты считаются из закрытых ведомостей, завершённых практик
 * и утверждённых перезачётов — всё, что обучающийся освоил.
 */
export async function admissionReport(studentId: string, locale = 'ru') {
  const student = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentId },
    select: {
      id: true,
      program: {
        select: {
          code: true,
          gosoProfile: { select: { totalCredits: true, finalCertCreditsMin: true } },
        },
      },
    },
  });

  const grades = await prisma.periodGrade.findMany({
    where: { studentId, isFinalized: true },
    select: {
      letter: true,
      course: {
        select: {
          discipline: {
            select: { credits: true, nameKk: true, nameRu: true, nameEn: true },
          },
        },
      },
    },
  });

  const placements = await prisma.practicePlacement.findMany({
    where: { studentId, status: { not: 'CANCELLED' } },
    select: { kind: true, status: true, credits: true },
  });

  const transfers = await loadCreditTransfers(studentId);
  const thesis = await prisma.thesis.findFirst({
    where: { studentId },
    select: { status: true },
    orderBy: { createdAt: 'desc' },
  });

  const pick = (d: { nameKk: string; nameRu: string; nameEn: string }) =>
    locale === 'kk' ? d.nameKk : locale === 'en' ? d.nameEn : d.nameRu;

  const passed = grades.filter((g) => g.letter && g.letter !== 'F' && g.letter !== 'FX');
  const failed = grades.filter((g) => g.letter === 'F' || g.letter === 'FX');

  const creditsEarned =
    passed.reduce((a, g) => a + g.course.discipline.credits, 0) +
    practiceCredits(placements.map((p) => ({ credits: dec(p.credits), status: p.status }))) +
    transfers.totals.creditsApproved;

  // Форма итоговой аттестации определяется программой; до заведения
  // формы в карточке ОП берётся защита дипломной работы как основная
  const form = 'THESIS_DEFENSE' as const;

  return checkAdmission({
    creditsEarned: Math.round(creditsEarned * 100) / 100,
    creditsRequired: student.program.gosoProfile?.totalCredits ?? 240,
    finalCertCredits: student.program.gosoProfile?.finalCertCreditsMin ?? 8,
    failedDisciplines: failed.map((g) => ({
      name: pick(g.course.discipline),
      letter: g.letter,
    })),
    unfinishedPractices: placements
      .filter((p) => p.status !== 'GRADED')
      .map((p) => ({ kind: p.kind as PracticeKindCode, status: p.status })),
    form,
    thesisStatus: thesis?.status ?? null,
  });
}

/** Аттестационные комиссии программы (F-FIN-01) */
export async function loadCommittees(filter: { programId?: string } = {}) {
  return prisma.attestationCommittee.findMany({
    where: { programId: filter.programId },
    include: {
      program: { select: { code: true, nameRu: true } },
      academicYear: { select: { name: true } },
      chair: { select: { lastNameRu: true, firstNameRu: true } },
      members: {
        include: { user: { select: { lastNameRu: true, firstNameRu: true } } },
      },
      _count: { select: { attestations: true } },
    },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { nameRu: 'asc' }],
  });
}

/** Дипломные работы (F-FIN-02) */
export async function loadTheses(filter: { supervisorId?: string; studentId?: string } = {}) {
  return prisma.thesis.findMany({
    where: { supervisorId: filter.supervisorId, studentId: filter.studentId },
    include: {
      student: {
        select: {
          id: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
          program: { select: { code: true } },
        },
      },
      supervisor: { select: { lastNameRu: true, firstNameRu: true } },
      department: { select: { code: true, nameRu: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Итоговые аттестации с протоколами (F-FIN-05) */
export async function loadAttestations(filter: { committeeId?: string } = {}) {
  return prisma.finalAttestation.findMany({
    where: { committeeId: filter.committeeId },
    include: {
      student: {
        select: {
          id: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
          program: { select: { code: true } },
        },
      },
      thesis: { select: { titleRu: true, status: true } },
      committee: { select: { nameRu: true } },
    },
    orderBy: [{ scheduledAt: 'asc' }],
  });
}

/** Выданные дипломы (F-FIN-07) */
export async function loadDiplomas() {
  return prisma.diploma.findMany({
    include: {
      student: {
        select: {
          id: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
          program: { select: { code: true, nameRu: true } },
        },
      },
      supplement: { select: { number: true, issuedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export { decOrNull };
