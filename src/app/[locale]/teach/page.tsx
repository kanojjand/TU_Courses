import { setRequestLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireUser } from '@/server/guards';
import { can, hasRole } from '@/lib/rbac';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/alert';
import { HOURS_PER_CREDIT } from '@/domain/constants';
import { NewCourseForm } from '@/components/teacher/new-course-form';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  DRAFT: 'neutral',
  ON_REVIEW: 'warning',
  REJECTED: 'danger',
  APPROVED: 'brand',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
} as const;

/** F-T-01. Список курсов преподавателя по академическим периодам. */
export default async function TeachPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('teacher');

  if (!user.teacherProfileId && !hasRole(user, 'ADMIN')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Профиль преподавателя не найден"
          description="Назначение на дисциплины выполняется офисом регистратора."
        />
      </div>
    );
  }

  const courses = await prisma.course.findMany({
    where: user.teacherProfileId
      ? { teachers: { some: { teacherId: user.teacherProfileId } } }
      : {},
    include: {
      discipline: true,
      period: { include: { academicYear: true } },
      modules: { include: { items: { select: { plannedAcademicHours: true } } } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { period: { startDate: 'desc' } },
  });

  // Справочники для самостоятельного заведения курса (F-T-01). Периоды —
  // текущего и будущих учебных лет: заводить курс в закрытом году незачем
  const canCreate = can(user, 'course:create') && Boolean(user.teacherProfileId);
  const disciplines = canCreate
    ? await prisma.discipline.findMany({
        where: { isActive: true },
        select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true, credits: true },
        orderBy: { code: 'asc' },
      })
    : [];
  const periods = canCreate
    ? await prisma.academicPeriod.findMany({
        where: { endDate: { gte: new Date() } },
        select: { id: true, name: true, academicYear: { select: { name: true } } },
        orderBy: [{ startDate: 'asc' }],
      })
    : [];

  const byPeriod = new Map<string, typeof courses>();
  for (const c of courses) {
    const key = `${c.period.academicYear.name} · ${c.period.name}`;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key)!.push(c);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t('myCourses')}</h1>

      {canCreate && (
        <NewCourseForm
          disciplines={disciplines.map((d) => ({
            id: d.id,
            label: `${d.code} · ${pickLocalized(d, 'name', locale)} · ${d.credits} кр.`,
            credits: d.credits,
          }))}
          periods={periods.map((p) => ({
            id: p.id,
            label: `${p.academicYear.name} · ${p.name}`,
          }))}
        />
      )}

      {courses.length === 0 ? (
        <EmptyState
          title="Курсы не назначены"
          description="Наличие роли «Преподаватель» само по себе не даёт доступа к курсам: требуется назначение на конкретную дисциплину в конкретном академическом периоде."
        />
      ) : (
        [...byPeriod.entries()].map(([period, list]) => (
          <section key={period} className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {period}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => {
                const planned = c.modules
                  .flatMap((m) => m.items)
                  .reduce((s, i) => s + dec(i.plannedAcademicHours), 0);
                const required = c.discipline.credits * HOURS_PER_CREDIT;
                const ok = Math.abs(planned - required) < 0.01;

                return (
                  <li key={c.id}>
                    <Link href={`/teach/courses/${c.id}`} className="block h-full">
                      <Card className="h-full transition-shadow hover:shadow-md">
                        <CardBody>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge tone={STATUS_TONE[c.status]}>
                              {t(
                                c.status === 'PUBLISHED'
                                  ? 'published'
                                  : c.status === 'ON_REVIEW'
                                    ? 'onReview'
                                    : c.status === 'REJECTED'
                                      ? 'rejected'
                                      : 'draft'
                              )}
                            </Badge>
                            <Badge>{c.discipline.credits} кр.</Badge>
                            <Badge>{c._count.enrollments} студ.</Badge>
                          </div>
                          <p className="font-medium leading-snug">
                            {pickLocalized(c.discipline, 'name', locale)}
                          </p>
                          <p className="mt-0.5 text-xs text-fg-muted">{c.discipline.code}</p>
                          <Progress
                            className="mt-3"
                            value={required > 0 ? (planned / required) * 100 : 0}
                            tone={ok ? 'success' : planned > required ? 'danger' : 'warning'}
                            label={t('hoursIndicator', {
                              planned: Math.round(planned * 10) / 10,
                              required,
                              credits: c.discipline.credits,
                            })}
                          />
                        </CardBody>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
