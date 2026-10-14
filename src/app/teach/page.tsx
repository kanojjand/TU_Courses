import { BookOpen, CalendarClock, CheckCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Section, Stat } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { upcomingWindows } from '@/lib/grades';
import { teacherOfferings } from '@/lib/teacher';

export default async function TeacherHome() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const offs = await teacherOfferings(user.id);
  const windows = await upcomingWindows([...new Set(offs.map((o) => o.offering.periodId))], 21);
  const gradingWindows = windows.filter((w) => w.kind.startsWith('grading') || w.kind === 'rk1' || w.kind === 'rk2' || w.kind === 'session');
  const toReview = offs.reduce((s, o) => s + o.toReview, 0);
  const students = offs.reduce((s, o) => s + o.students, 0);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('learn.hello', { name: user.firstName })} description={t('teach.subtitle')} />
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('nav.myStreams')} value={offs.length} />
        <Stat label={t('common.students')} value={students} />
        <Stat label={t('nav.toReview')} value={toReview} tone={toReview > 0 ? 'brand' : undefined} href="/teach/review" />
      </div>
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title={t('nav.myStreams')}>
          {offs.length === 0 ? (
            <EmptyState icon={<BookOpen />} title={t('teach.noStreams')} text={t('teach.noStreamsHint')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {offs.map((o) => (
                <Link key={o.offering.id} href={`/teach/${o.offering.id}`} data-card className="group rounded-xl border border-border bg-surface p-4 shadow-sm hover:border-brand/40">
                  <p className="line-clamp-2 font-semibold leading-snug group-hover:text-brand">{pickName(o.discipline, locale)}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    {t(`enums.lessonType.${o.offering.lessonType}`)} · {o.offering.stream}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 text-fg-muted">
                      <Users className="size-4" />
                      {t('teach.studentsN', { n: o.students })}
                    </span>
                    {o.toReview > 0 && (
                      <Badge tone="brand">
                        <CheckCheck className="size-3.5" />
                        {t('teach.toReviewN', { n: o.toReview })}
                      </Badge>
                    )}
                    {!o.courseTitle && <Badge tone="warning">{t('teach.noCourse')}</Badge>}
                  </div>
                  {o.avgProgress !== null && (
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={o.avgProgress} />
                      <span className="text-xs whitespace-nowrap text-fg-muted">{t('teach.avgProgress', { n: o.avgProgress })}</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </Section>
        <Section title={t('teach.windows')}>
          {gradingWindows.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">{t('teach.noWindows')}</p>
          ) : (
            <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
              {gradingWindows.map((w) => (
                <li key={w.id} className="flex gap-3 p-3.5">
                  <CalendarClock className="mt-0.5 size-5 shrink-0 text-fg-muted" />
                  <div>
                    <p className="text-[0.9375rem] font-medium">{t(`enums.windowKind.${w.kind}`)}</p>
                    <p className="text-sm text-fg-muted">
                      {format.dateTime(w.startsAt, { day: 'numeric', month: 'short' })} — {format.dateTime(w.endsAt, { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
