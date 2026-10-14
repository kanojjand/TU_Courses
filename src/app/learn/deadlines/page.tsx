import { CalendarClock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageHeader, Section } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { isDefaultItemTitle } from '@/lib/item-title';
import { upcomingWindows } from '@/lib/grades';
import { studentDeadlines, studentOfferings, type DeadlineItem } from '@/lib/student';

export default async function DeadlinesPage() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const [items, offs] = await Promise.all([studentDeadlines(user.id), studentOfferings(user.id)]);
  const windows = await upcomingWindows([...new Set(offs.map((o) => o.offering.periodId))], 120);
  const actionable = items.filter((d) => d.blockId);
  const overdue = actionable.filter((d) => !d.done && d.timing === 'late');
  const upcoming = actionable.filter((d) => !d.done && (d.timing === 'on_time' || d.timing === 'not_open'));
  const done = actionable.filter((d) => d.done);
  const date = (d: Date | null) => (d ? format.dateTime(d, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—');

  const List = ({ list, tone }: { list: DeadlineItem[]; tone?: 'danger' | 'success' }) => (
    <ul data-card className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {list.map((d) => (
        <li key={d.itemId}>
          <Link href={d.lessonId ? `/learn/${d.offeringId}/${d.lessonId}` : `/learn/${d.offeringId}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
            {tone === 'success' ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <CalendarClock className={tone === 'danger' ? 'size-5 shrink-0 text-danger' : 'size-5 shrink-0 text-fg-muted'} />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{isDefaultItemTitle(d.title) ? t(`enums.componentLong.${d.component as 'TK1'}`) : d.title}</p>
              <p className="text-sm text-fg-muted">
                {pickName(d.disciplineName, locale)} · {t(`enums.component.${d.component as 'TK1'}`)}
              </p>
            </div>
            <div className="text-right text-sm">
              {tone === 'success' ? (
                d.score !== null ? <span className="text-lg font-bold">{d.score}</span> : <Badge tone="success">{t('learn.deadlines.done')}</Badge>
              ) : (
                <>
                  <p className={tone === 'danger' ? 'font-medium text-danger' : 'font-medium'}>{t('learn.deadlines.dueIn', { date: date(d.dueAt) })}</p>
                  {d.hardCloseAt && <p className="text-xs text-fg-muted">{t('learn.deadlines.hardClose', { date: date(d.hardCloseAt) })}</p>}
                </>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('learn.deadlines.title')} description={t('learn.deadlines.subtitle')} />
      {actionable.length === 0 && <EmptyState icon={<CalendarClock />} title={t('learn.nothingDue')} />}
      {overdue.length > 0 && (
        <Section title={t('learn.deadlines.overdue')}>
          <List list={overdue} tone="danger" />
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section title={t('learn.deadlines.upcoming')}>
          <List list={upcoming} />
        </Section>
      )}
      {done.length > 0 && (
        <Section title={t('learn.deadlines.done')}>
          <List list={done} tone="success" />
        </Section>
      )}
      {windows.length > 0 && (
        <Section title={t('learn.deadlines.calendar')}>
          <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
            {windows.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <span className="font-medium">{t(`enums.windowKind.${w.kind}`)}</span>
                <span className="text-sm text-fg-muted">
                  {format.dateTime(w.startsAt, { day: 'numeric', month: 'short' })} — {format.dateTime(w.endsAt, { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
