import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, Section } from '@/components/ui/page';
import { Progress, ProgressRing } from '@/components/ui/progress';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { flattenLessons } from '@/lib/course';
import { recentGrades, studentCourses, studentDeadlines } from '@/lib/student';
import { shortName } from '@/lib/utils';

export default async function StudentHome() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const [{ courses, pending }, deadlines, grades] = await Promise.all([
    studentCourses(user.id),
    studentDeadlines(user.id),
    recentGrades(user.id, 4),
  ]);

  // «Продолжить»: курс, который открывали последним и ещё не закончили
  const resumable = courses
    .filter((c) => c.snap && c.progress && c.progress.percent < 100)
    .sort((a, b) => (b.progress!.lastSeenAt?.getTime() ?? 0) - (a.progress!.lastSeenAt?.getTime() ?? 0));
  const resume = resumable[0];
  const resumeLesson = resume?.snap ? flattenLessons(resume.snap).find((l) => l.id === resume.progress!.continueLessonId) : undefined;

  const weekAhead = Date.now() + 7 * 86400_000;
  const due = deadlines
    .filter((d) => !d.done && d.blockId && (d.timing === 'on_time' || d.timing === 'late') && (!d.dueAt || d.dueAt.getTime() <= weekAhead))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-[1.6rem] font-bold tracking-tight sm:text-[1.9rem]">{t('learn.hello', { name: user.firstName })}</h1>
        <p className="mt-1 text-fg-muted">{t('learn.todayHint')}</p>
      </div>

      {resume && resumeLesson && (
        <Card className="mb-7 overflow-hidden border-brand/25">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand">{t('learn.continueTitle')}</p>
              <p className="mt-1 truncate text-lg font-semibold">{resume.snap!.title}</p>
              <p className="mt-0.5 truncate text-fg-muted">{resumeLesson.title}</p>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={resume.progress!.percent} className="max-w-xs" label={t('common.progress')} />
                <span className="text-sm whitespace-nowrap text-fg-muted">{t('learn.lessonsDone', { done: resume.progress!.completed, total: resume.progress!.total })}</span>
              </div>
            </div>
            <Link href={`/learn/${resume.offering.id}/${resumeLesson.id}`} className={buttonClass('primary', 'lg', 'w-full sm:w-auto')}>
              {t('learn.continue')}
              <ArrowRight />
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title={t('nav.myCourses')}>
          {courses.length === 0 && pending.length === 0 ? (
            <EmptyState icon={<BookOpen />} title={t('learn.noCourses')} text={t('learn.noCoursesHint')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((c) => {
                const p = c.progress;
                const href = c.snap && p?.continueLessonId ? `/learn/${c.offering.id}` : `/learn/${c.offering.id}`;
                return (
                  <Link key={c.offering.id} href={href} data-card className="group flex gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-brand/40">
                    <ProgressRing value={p?.percent ?? 0} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold leading-snug group-hover:text-brand">{c.snap?.title ?? pickName(c.discipline, locale)}</p>
                      {c.teacher?.lastName && <p className="mt-0.5 truncate text-sm text-fg-muted">{shortName(c.teacher)}</p>}
                      <p className="mt-1.5 text-xs text-fg-muted">{p ? t('learn.lessonsDone', { done: p.completed, total: p.total }) : ''}</p>
                    </div>
                  </Link>
                );
              })}
              {pending.map((o) => (
                <div key={o.discipline.id} data-card className="flex gap-4 rounded-xl border border-dashed border-border bg-surface p-4">
                  <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                    <Clock className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold leading-snug">{pickName(o.discipline, locale)}</p>
                    <p className="mt-1 text-sm text-fg-muted">{t('learn.courseNotReady')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div>
          <Section
            title={t('learn.thisWeek')}
            action={
              <Link href="/learn/deadlines" className="text-sm font-medium text-brand hover:underline">
                {t('learn.allDeadlines')}
              </Link>
            }
          >
            {due.length === 0 ? (
              <div data-card className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">
                <CheckCircle2 className="size-5 text-success" />
                {t('learn.nothingDue')}
              </div>
            ) : (
              <ul data-card className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {due.map((d) => (
                  <li key={d.itemId}>
                    <Link href={d.lessonId ? `/learn/${d.offeringId}/${d.lessonId}` : `/learn/${d.offeringId}`} className="flex items-start gap-3 p-3.5 hover:bg-surface-2/60">
                      <CalendarClock className={d.timing === 'late' ? 'mt-0.5 size-5 shrink-0 text-danger' : 'mt-0.5 size-5 shrink-0 text-fg-muted'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-medium">{d.title}</p>
                        <p className="truncate text-xs text-fg-muted">{pickName(d.disciplineName, locale)}</p>
                      </div>
                      {d.dueAt && (
                        <Badge tone={d.timing === 'late' ? 'danger' : d.dueAt.getTime() - Date.now() < 2 * 86400_000 ? 'warning' : 'neutral'}>
                          {d.timing === 'late' ? t('common.overdue') : format.dateTime(d.dueAt, { day: 'numeric', month: 'short' })}
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {grades.length > 0 && (
            <Section
              title={t('learn.recentGrades')}
              action={
                <Link href="/learn/grades" className="text-sm font-medium text-brand hover:underline">
                  {t('learn.allGrades')}
                </Link>
              }
            >
              <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
                {grades.map((g) => (
                  <li key={g.grade.id} className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9375rem] font-medium">{g.item.title}</p>
                      <p className="truncate text-xs text-fg-muted">{pickName(g.discipline, locale)}</p>
                    </div>
                    <span className="text-lg font-bold tabular-nums">{g.grade.score}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
