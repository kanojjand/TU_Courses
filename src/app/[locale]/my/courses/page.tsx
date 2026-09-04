import { setRequestLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireUser } from '@/server/guards';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/** Список дисциплин обучающегося, сгруппированный по академическим периодам. */
export default async function MyCoursesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('nav');
  const ts = await getTranslations('student');

  if (!user.studentProfileId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState title="Профиль обучающегося не найден" />
      </div>
    );
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: user.studentProfileId,
      cancelledAt: null,
      course: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    },
    include: {
      course: {
        include: {
          discipline: true,
          period: { include: { academicYear: true } },
          progress: { where: { studentId: user.studentProfileId } },
          periodGrades: { where: { studentId: user.studentProfileId } },
        },
      },
    },
    orderBy: { course: { period: { startDate: 'desc' } } },
  });

  const byPeriod = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const key = `${e.course.period.academicYear.name} · ${e.course.period.name}`;
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key)!.push(e);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t('myCourses')}</h1>

      {enrollments.length === 0 ? (
        <EmptyState
          title="Нет доступных дисциплин"
          description="Регистрация на дисциплины выполняется офисом регистратора."
        />
      ) : (
        [...byPeriod.entries()].map(([period, list]) => (
          <section key={period} className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {period}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => {
                const p = e.course.progress[0];
                const g = e.course.periodGrades[0];
                const percent = dec(p?.percent);
                return (
                  <li key={e.id}>
                    <Link href={`/my/courses/${e.course.id}`} className="block h-full">
                      <Card className="h-full transition-shadow hover:shadow-md">
                        <CardBody>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge tone="brand">{e.course.discipline.credits} кр.</Badge>
                            {g?.letter && <Badge tone="success">{g.letter}</Badge>}
                          </div>
                          <p className="font-medium leading-snug">
                            {pickLocalized(e.course.discipline, 'name', locale)}
                          </p>
                          <p className="mt-0.5 text-xs text-fg-muted">{e.course.discipline.code}</p>
                          <Progress
                            className="mt-3"
                            value={percent}
                            tone={percent >= 100 ? 'success' : 'brand'}
                            label={ts('progressHours', {
                              earned: Math.round(dec(p?.earnedHours)),
                              total: Math.round(dec(p?.totalHours)),
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
