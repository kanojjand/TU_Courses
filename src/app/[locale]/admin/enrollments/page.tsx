import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { EnrollmentsPanel } from '@/components/admin/enrollments-panel';

export const dynamic = 'force-dynamic';

/** F-A-04. Назначение преподавателей, формирование потоков, регистрация студентов. */
export default async function EnrollmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ course?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'enrollment:manage');

  const { course: selectedCourseId } = await searchParams;
  const t = await getTranslations('admin');

  const [periods, disciplines, teachers, groups, courses] = await Promise.all([
    prisma.academicPeriod.findMany({
      include: { academicYear: true },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { ordinal: 'asc' }],
    }),
    prisma.discipline.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true, credits: true },
    }),
    prisma.teacherProfile.findMany({
      include: {
        user: { select: { lastNameRu: true, firstNameRu: true } },
        department: { select: { code: true } },
      },
      orderBy: { user: { lastNameRu: 'asc' } },
    }),
    prisma.studyGroup.findMany({
      where: { isActive: true },
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.course.findMany({
      include: {
        discipline: { select: { code: true, nameRu: true, nameKk: true, nameEn: true } },
        period: { include: { academicYear: true } },
        teachers: {
          include: { teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } } },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ period: { startDate: 'desc' } }, { discipline: { code: 'asc' } }],
      take: 300,
    }),
  ]);

  const selected = selectedCourseId
    ? await prisma.enrollment.findMany({
        where: { courseId: selectedCourseId, cancelledAt: null },
        include: {
          student: {
            include: {
              user: { select: { lastNameRu: true, firstNameRu: true, email: true } },
              group: { select: { name: true } },
            },
          },
        },
        orderBy: { student: { user: { lastNameRu: 'asc' } } },
      })
    : [];

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{t('enrollments')}</h1>
      <EnrollmentsPanel
        selectedCourseId={selectedCourseId ?? null}
        periods={periods.map((p) => ({
          id: p.id,
          label: `${p.academicYear.name} · ${p.name}`,
        }))}
        disciplines={disciplines.map((d) => ({
          id: d.id,
          label: `${d.code} — ${pickLocalized(d, 'name', locale)} (${d.credits} кр.)`,
        }))}
        teachers={teachers.map((t) => ({
          id: t.id,
          label: `${t.user.lastNameRu} ${t.user.firstNameRu} · ${t.department.code}`,
        }))}
        groups={groups.map((g) => ({
          id: g.id,
          label: `${g.name} (${g._count.students} чел.)`,
        }))}
        courses={courses.map((c) => ({
          id: c.id,
          label: `${c.discipline.code} — ${pickLocalized(c.discipline, 'name', locale)}`,
          period: `${c.period.academicYear.name} · ${c.period.name}`,
          stream: c.streamName,
          status: c.status,
          teachers: c.teachers
            .map((ct) => `${ct.teacher.user.lastNameRu} ${ct.teacher.user.firstNameRu}`)
            .join(', '),
          enrolled: c._count.enrollments,
        }))}
        enrollments={selected.map((e) => ({
          studentId: e.student.id,
          name: `${e.student.user.lastNameRu} ${e.student.user.firstNameRu}`,
          email: e.student.user.email,
          group: e.student.group?.name ?? '',
          source: e.source,
        }))}
      />
    </>
  );
}
