import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { GroupsPanel } from '@/components/admin/groups-panel';
import { groupAttendance, attendanceThreshold } from '@/server/attendance';

export const dynamic = 'force-dynamic';

/**
 * F-GRP-01…F-GRP-05. Академические группы: состав, куратор, эдвайзеры,
 * перевод между группами и статусы обучающихся.
 */
export default async function GroupsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'group:manage');
  const t = await getTranslations('admin');

  const [groups, programs, curricula, teachers] = await Promise.all([
    prisma.studyGroup.findMany({
      include: {
        program: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
        curriculum: { select: { admissionYear: true, version: true, status: true } },
        curator: {
          select: { id: true, user: { select: { lastNameRu: true, firstNameRu: true } } },
        },
        students: {
          where: { status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY'] } },
          select: {
            id: true,
            studyYear: true,
            status: true,
            creditsEarned: true,
            user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } },
            advisor: {
              select: { id: true, user: { select: { lastNameRu: true, firstNameRu: true } } },
            },
            gpaRecords: { where: { scope: 'CUMULATIVE' }, take: 1, select: { gpa: true } },
            ieps: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { user: { lastNameRu: 'asc' } },
        },
      },
      orderBy: [{ program: { code: 'asc' } }, { name: 'asc' }],
    }),
    prisma.educationProgram.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
      orderBy: { code: 'asc' },
    }),
    prisma.curriculum.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, programId: true, admissionYear: true, version: true },
      orderBy: [{ admissionYear: 'desc' }, { version: 'desc' }],
    }),
    prisma.teacherProfile.findMany({
      select: {
        id: true,
        user: { select: { lastNameRu: true, firstNameRu: true } },
        department: { select: { code: true } },
      },
      orderBy: { user: { lastNameRu: 'asc' } },
    }),
  ]);

  // F-GRP-03: посещаемость в сводке группы. Считается по группам, а не
  // одним запросом на всех: у каждой группы свой набор курсов, и общий
  // знаменатель дал бы заниженный процент
  const attendance = new Map(
    await Promise.all(
      groups.map(async (g) => [g.id, await groupAttendance(g.id)] as const)
    )
  );
  const threshold = await attendanceThreshold();

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">{t('groups')}</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Группа привязана к образовательной программе, году набора и учебному плану. Куратор
        и эдвайзеры назначаются с периодом действия — история назначений сохраняется.
      </p>

      <GroupsPanel
        threshold={threshold}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          programId: g.programId,
          programCode: g.program.code,
          programName: pickLocalized(g.program, 'name', locale),
          studyYear: g.studyYear,
          admissionYear: g.admissionYear,
          language: g.language,
          studyForm: g.studyForm,
          curriculumId: g.curriculumId,
          curriculumLabel: g.curriculum
            ? `набор ${g.curriculum.admissionYear}, в. ${g.curriculum.version}`
            : null,
          curatorId: g.curatorId,
          curatorName: g.curator
            ? `${g.curator.user.lastNameRu} ${g.curator.user.firstNameRu}`
            : null,
          attendancePercent: attendance.get(g.id)?.averagePercent ?? 0,
          students: g.students.map((s) => ({
            id: s.id,
            name: `${s.user.lastNameRu} ${s.user.firstNameRu}${
              s.user.middleNameRu ? ' ' + s.user.middleNameRu : ''
            }`,
            studyYear: s.studyYear,
            status: s.status,
            creditsEarned: dec(s.creditsEarned),
            gpa: s.gpaRecords[0] ? dec(s.gpaRecords[0].gpa) : null,
            advisorId: s.advisor?.id ?? null,
            advisorName: s.advisor
              ? `${s.advisor.user.lastNameRu} ${s.advisor.user.firstNameRu}`
              : null,
            iepStatus: s.ieps[0]?.status ?? null,
            attendancePercent:
              attendance.get(g.id)?.rows.find((r) => r.studentId === s.id)?.percent ?? null,
            attendanceMarked:
              (attendance.get(g.id)?.rows.find((r) => r.studentId === s.id)?.total ?? 0) > 0,
          })),
        }))}
        programs={programs.map((p) => ({
          id: p.id,
          code: p.code,
          name: pickLocalized(p, 'name', locale),
        }))}
        curricula={curricula.map((c) => ({
          id: c.id,
          programId: c.programId,
          label: `набор ${c.admissionYear}, в. ${c.version}`,
        }))}
        teachers={teachers.map((t2) => ({
          id: t2.id,
          name: `${t2.user.lastNameRu} ${t2.user.firstNameRu}`,
          department: t2.department.code,
        }))}
      />
    </>
  );
}
