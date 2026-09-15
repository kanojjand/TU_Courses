import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, CalendarClock, CheckCircle2, GraduationCap, TrendingUp } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireUser } from '@/server/guards';
import { hasRole, homeRouteFor } from '@/lib/rbac';
import { summarizeProgress } from '@/domain/activity';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { NotificationList } from '@/components/student/notification-list';
import { fmtDateTime, fmtGpa } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-S-03. Главная страница кабинета обучающегося. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('student');
  const tg = await getTranslations('grades');

  if (!user.studentProfileId) {
    // Форма входа всегда ведёт на /dashboard. У ролей без профиля обучающегося
    // (администратор, регистратор, преподаватель, методист) домашний раздел другой —
    // отправляем туда, вместо тупика с пустым состоянием.
    const home = homeRouteFor(user);
    if (home !== '/dashboard') redirect(`/${locale}${home}`);

    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Кабинет обучающегося недоступен"
          description={
            hasRole(user, 'TEACHER', 'TUTOR')
              ? 'Ваша учётная запись не связана с профилем обучающегося. Перейдите в раздел «Мои курсы».'
              : 'Ваша учётная запись не связана с профилем обучающегося.'
          }
        />
      </div>
    );
  }

  const studentId = user.studentProfileId;

  const [enrollments, notifications, gpa, deadlines] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId, cancelledAt: null, course: { status: 'PUBLISHED' } },
      include: {
        course: {
          include: {
            discipline: true,
            period: { select: { name: true, isCurrent: true, endDate: true } },
          },
        },
      },
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.gpaRecord.findFirst({ where: { studentId, scope: 'CUMULATIVE' } }),
    prisma.assignment.findMany({
      where: {
        dueAt: { gte: new Date() },
        contentItem: {
          module: {
            course: { enrollments: { some: { studentId, cancelledAt: null } }, status: 'PUBLISHED' },
          },
        },
        submissions: { none: { studentId, status: { in: ['SUBMITTED', 'GRADED'] } } },
      },
      orderBy: { dueAt: 'asc' },
      take: 6,
      include: {
        contentItem: {
          select: {
            title: true,
            module: {
              select: { course: { select: { id: true, discipline: { select: { nameRu: true, nameKk: true, nameEn: true } } } } },
            },
          },
        },
      },
    }),
  ]);

  const current = enrollments.filter((e) => e.course.period.isCurrent);
  const shown = current.length > 0 ? current : enrollments;

  // Итоги по курсу считаются по его фактическому составу, а не по строке Progress:
  // та обновляется только при активности обучающегося (recalculateCourseProgress),
  // поэтому в только что наполненном преподавателем курсе показывала бы «0 из 0».
  const courseModules = await prisma.module.findMany({
    where: { courseId: { in: shown.map((e) => e.courseId) }, isPublished: true },
    orderBy: { orderIndex: 'asc' },
    select: {
      courseId: true,
      items: {
        where: { isPublished: true },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          title: true,
          plannedAcademicHours: true,
          completions: { where: { studentId }, select: { earnedHours: true } },
        },
      },
    },
  });

  const summaryByCourse = new Map(
    shown.map((e) => [
      e.courseId,
      summarizeProgress(
        courseModules
          .filter((m) => m.courseId === e.courseId)
          .flatMap((m) =>
            m.items.map((i) => ({
              plannedAcademicHours: dec(i.plannedAcademicHours),
              completed: i.completions.length > 0,
              earnedHours: dec(i.completions[0]?.earnedHours),
            }))
          ),
        e.course.discipline.credits
      ),
    ])
  );

  const totalHours = shown.reduce((s, e) => s + (summaryByCourse.get(e.courseId)?.totalHours ?? 0), 0);
  const earnedHours = shown.reduce((s, e) => s + (summaryByCourse.get(e.courseId)?.earnedHours ?? 0), 0);
  const overall = totalHours > 0 ? (earnedHours / totalHours) * 100 : 0;

  // Главное действие на первом экране: куда идти прямо сейчас. Берётся курс,
  // который уже начат (наибольший прогресс меньше 100 %), а если начатых нет —
  // первый незавершённый. Внутри него — первое непройденное занятие по порядку.
  const unfinished = shown
    .map((e) => ({ enrollment: e, summary: summaryByCourse.get(e.courseId) }))
    .filter((c) => c.summary && c.summary.totalItems > 0 && c.summary.percent < 100)
    .sort((a, b) => (b.summary?.percent ?? 0) - (a.summary?.percent ?? 0));

  const nextStep = unfinished
    .map(({ enrollment, summary }) => {
      const item = courseModules
        .filter((m) => m.courseId === enrollment.courseId)
        .flatMap((m) => m.items)
        .find((i) => i.completions.length === 0);
      return item && summary ? { enrollment, summary, item } : null;
    })
    .find((step) => step !== null);

  const allDone = shown.length > 0 && !nextStep;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">{user.name}</h1>

      {nextStep ? (
        <Card className="mt-5 overflow-hidden border-brand/30">
          <CardBody className="space-y-4 bg-brand-soft/60 sm:flex sm:items-center sm:gap-6 sm:space-y-0">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                {t('continueNext')}
              </p>
              <p className="mt-1 text-lg font-bold leading-snug">{nextStep.item.title}</p>
              <p className="mt-0.5 text-sm text-fg-muted">
                {pickLocalized(nextStep.enrollment.course.discipline, 'name', locale)}
              </p>
              <Progress
                className="mt-3"
                value={nextStep.summary.percent}
                label={t('progressItems', {
                  done: nextStep.summary.completedItems,
                  total: nextStep.summary.totalItems,
                })}
              />
            </div>
            <Link
              href={`/my/courses/${nextStep.enrollment.courseId}/items/${nextStep.item.id}`}
              className="block sm:shrink-0"
            >
              <Button size="lg" className="w-full sm:w-auto">
                {t('continueButton')} <ArrowRight size={18} aria-hidden />
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : allDone ? (
        <Card className="mt-5">
          <CardBody className="flex items-center gap-3">
            <CheckCircle2 size={22} aria-hidden className="shrink-0 text-success" />
            <p className="font-medium">{t('allDone')}</p>
          </CardBody>
        </Card>
      ) : null}

      {/* Показатели — плитки-ссылки в одну строку: на телефоне три отдельные
          карточки занимали весь первый экран и отодвигали сами занятия */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
        <Link href="/my/courses" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardBody className="px-3 py-3 sm:px-5 sm:py-4">
              <TrendingUp size={18} aria-hidden className="text-brand" />
              <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{Math.round(overall)}%</p>
              <p className="text-[0.6875rem] leading-tight text-fg-muted sm:text-xs">
                {t('overallProgress')}
              </p>
            </CardBody>
          </Card>
        </Link>
        <Link href="/my/grades" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardBody className="px-3 py-3 sm:px-5 sm:py-4">
              <GraduationCap size={18} aria-hidden className="text-brand" />
              <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">
                {fmtGpa(gpa ? dec(gpa.gpa) : null, locale)}
              </p>
              <p className="text-[0.6875rem] leading-tight text-fg-muted sm:text-xs">
                {t('currentGpa')}
              </p>
            </CardBody>
          </Card>
        </Link>
        <a href="#deadlines" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardBody className="px-3 py-3 sm:px-5 sm:py-4">
              <CalendarClock size={18} aria-hidden className="text-warning" />
              <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{deadlines.length}</p>
              <p className="text-[0.6875rem] leading-tight text-fg-muted sm:text-xs">
                {t('upcomingDeadlines')}
              </p>
            </CardBody>
          </Card>
        </a>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t('currentCourses')}</h2>
          {shown.length === 0 ? (
            <EmptyState
              title="Нет доступных дисциплин"
              description="Регистрация на дисциплины выполняется офисом регистратора."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((e) => {
                const summary = summaryByCourse.get(e.courseId);
                const percent = summary?.percent ?? 0;
                return (
                  <li key={e.id}>
                    <Link href={`/my/courses/${e.course.id}`} className="block h-full">
                      <Card className="h-full transition-shadow hover:shadow-md">
                        <CardBody>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge tone="brand">{e.course.discipline.credits} кр.</Badge>
                            <Badge>{e.course.period.name}</Badge>
                          </div>
                          <p className="font-medium leading-snug">
                            {pickLocalized(e.course.discipline, 'name', locale)}
                          </p>
                          <p className="mt-0.5 text-xs text-fg-muted">{e.course.discipline.code}</p>
                          <Progress
                            className="mt-3"
                            value={percent}
                            tone={percent >= 100 ? 'success' : 'brand'}
                            label={t('progressItems', {
                              done: summary?.completedItems ?? 0,
                              total: summary?.totalItems ?? 0,
                            })}
                          />
                        </CardBody>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <Card id="deadlines" className="scroll-mt-20">
            <CardHeader><CardTitle>{t('upcomingDeadlines')}</CardTitle></CardHeader>
            <CardBody>
              {deadlines.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('noDeadlines')}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {deadlines.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/my/courses/${d.contentItem.module.course.id}`}
                        className="block hover:text-brand"
                      >
                        <p className="font-medium leading-snug">{d.contentItem.title}</p>
                        <p className="text-xs text-fg-muted">
                          {pickLocalized(d.contentItem.module.course.discipline, 'name', locale)}
                        </p>
                        <p className="text-xs text-warning">{fmtDateTime(d.dueAt, locale)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tg('gpa')} и журнал</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Link href="/my/grades" className="block text-brand hover:underline">
                Журнал успеваемости
              </Link>
              <Link href="/my/transcript" className="block text-brand hover:underline">
                Транскрипт
              </Link>
            </CardBody>
          </Card>

          <NotificationList
            locale={locale}
            items={notifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              link: n.link,
              isRead: n.isRead,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
        </aside>
      </div>
    </div>
  );
}
