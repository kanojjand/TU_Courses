import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { loadPracticeBases, loadPlacements } from '@/server/attestation';
import { PracticePanel } from '@/components/admin/practice-panel';

export const dynamic = 'force-dynamic';

/** F-PRC-01…F-PRC-04. Базы практики и распределение обучающихся. */
export default async function PracticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'enrollment:manage');

  // Последовательно: пул на одно соединение (см. src/lib/prisma.ts)
  const bases = await loadPracticeBases();
  const placements = await loadPlacements();
  const students = await prisma.studentProfile.findMany({
    where: { status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY'] } },
    select: {
      id: true,
      user: { select: { lastNameRu: true, firstNameRu: true } },
      group: { select: { name: true } },
      program: { select: { code: true } },
    },
    orderBy: { user: { lastNameRu: 'asc' } },
    take: 300,
  });
  const teachers = await prisma.teacherProfile.findMany({
    select: { userId: true, user: { select: { lastNameRu: true, firstNameRu: true } } },
    orderBy: { user: { lastNameRu: 'asc' } },
  });

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Профессиональная практика</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Реестр баз практики и распределение обучающихся. При наличии дополнительной
        программы (Minor) база выбирается по профилю основной — система это проверяет.
        Кредиты завершённой практики входят в общий прогресс наравне с дисциплинами.
      </p>

      <PracticePanel
        bases={bases.map((b) => ({
          id: b.id,
          nameRu: b.nameRu,
          bin: b.bin,
          address: b.address,
          contactPerson: b.contactPerson,
          contactPhone: b.contactPhone,
          profileNote: b.profileNote,
          capacity: b.capacity,
          occupied: b.occupied,
          freeCapacity: b.freeCapacity,
          contractNo: b.contractNo,
          contractFrom: b.contractFrom?.toISOString().slice(0, 10) ?? null,
          contractTo: b.contractTo?.toISOString().slice(0, 10) ?? null,
          isActive: b.isActive,
        }))}
        placements={placements.map((p) => ({
          id: p.id,
          studentName: `${p.student.user.lastNameRu} ${p.student.user.firstNameRu}`,
          groupName: p.student.group?.name ?? null,
          hasMinor: p.student.minorProgramId != null,
          kind: p.kind,
          baseName: p.base?.nameRu ?? null,
          startsOn: p.startsOn.toISOString().slice(0, 10),
          endsOn: p.endsOn.toISOString().slice(0, 10),
          credits: dec(p.credits),
          status: p.status,
          isMajorProfile: p.isMajorProfile,
          supervisorName: p.supervisor
            ? `${p.supervisor.lastNameRu} ${p.supervisor.firstNameRu}`
            : null,
          supervisorBaseName: p.supervisorBaseName,
          diaryCount: p._count.diary,
          reportScore: p.report?.score ? dec(p.report.score) : null,
          reportLetter: p.report?.letter ?? null,
        }))}
        students={students.map((s) => ({
          id: s.id,
          name: `${s.user.lastNameRu} ${s.user.firstNameRu}`,
          groupName: s.group?.name ?? null,
          programCode: s.program.code,
        }))}
        teachers={teachers.map((t) => ({
          id: t.userId,
          name: `${t.user.lastNameRu} ${t.user.firstNameRu}`,
        }))}
      />
    </>
  );
}
