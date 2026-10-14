import { CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, PageHeader, Tabs } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { teacherReviewQueue } from '@/lib/teacher';
import { fullName } from '@/lib/utils';

export default async function ReviewQueue({ searchParams }: { searchParams: Promise<{ offering?: string; tab?: string }> }) {
  const { offering, tab } = await searchParams;
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const graded = tab === 'graded';
  const all = await teacherReviewQueue(user.id, graded);
  const list = offering ? all.filter((r) => r.offering.id === offering) : all;
  const q = offering ? `offering=${offering}&` : '';
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('teach.review.title')} description={t('teach.review.subtitle')} />
      <Tabs
        active={graded ? `/teach/review?${q}tab=graded` : `/teach/review${offering ? `?offering=${offering}` : ''}`}
        items={[
          { href: `/teach/review${offering ? `?offering=${offering}` : ''}`, label: t('teach.review.pending') },
          { href: `/teach/review?${q}tab=graded`, label: t('teach.review.gradedTab') },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon={<CheckCheck />} title={t('teach.review.empty')} />
      ) : (
        <ul data-card className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {list.map((r) => (
            <li key={r.submission.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{fullName(r.student)}</p>
                <p className="text-sm text-fg-muted">
                  {r.block.title} · {pickName(r.discipline, locale)} · {r.offering.stream}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {t('teach.review.submittedAt')}: {format.dateTime(r.submission.submittedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              {r.submission.isLate && <Badge tone="danger">{t('common.late')}</Badge>}
              {graded ? (
                <span className="text-lg font-bold tabular-nums">{r.submission.score}</span>
              ) : (
                <Link href={`/teach/review/${r.submission.id}`} className={buttonClass('primary')}>
                  {t('teach.review.check')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
