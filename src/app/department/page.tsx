import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader, Section, Stat } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { readiness } from '@/lib/department';
import { departmentScope } from '@/lib/rbac';
import { COURSE_TONE } from '@/lib/tones';
import { shortName } from '@/lib/utils';

export default async function DepartmentHome() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const scope = await departmentScope(user, 'dept_head');
  const { rows, withoutCourse } = await readiness(scope);
  const review = rows.filter((r) => r.course.status === 'review');
  const published = rows.filter((r) => r.course.currentVersionId).length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.dept.title')} description={t('reports.dept.subtitle')} />
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('reports.dept.courses')} value={rows.length} />
        <Stat label={t('reports.dept.published')} value={published} tone="success" />
        <Stat label={t('reports.dept.toReview')} value={review.length} tone={review.length ? 'warning' : undefined} />
        <Stat label={t('reports.dept.noCourse')} value={withoutCourse.length} tone={withoutCourse.length ? 'danger' : undefined} href="/department/authors" />
      </div>
      {review.length > 0 && (
        <Section title={t('reports.dept.toReview')}>
          <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
            {review.map((r) => (
              <li key={r.course.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.course.title}</p>
                  <p className="text-sm text-fg-muted">
                    {r.discipline.code} · {r.course.language.toUpperCase()} · {r.authors.map(shortName).join(', ')} · {format.dateTime(r.course.updatedAt, { dateStyle: 'medium' })}
                  </p>
                </div>
                <Link href={`/department/courses/${r.course.id}`} className={buttonClass('primary')}>
                  {t('reports.dept.review')}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {withoutCourse.length > 0 && (
        <Section title={t('reports.dept.disciplinesNoCourse')}>
          <ul data-card className="divide-y divide-border rounded-xl border border-danger/30 bg-surface">
            {withoutCourse.map((w) => (
              <li key={`${w.discipline.id}-${w.language}`} className="flex flex-wrap items-center gap-3 p-3.5">
                <AlertTriangle className="size-5 text-danger" />
                <span className="min-w-0 flex-1">
                  {w.discipline.code} · {pickName(w.discipline, locale)} · {w.language.toUpperCase()}
                </span>
                <span className="text-sm text-fg-muted">
                  {t('reports.dept.streams')}: {w.streams}
                </span>
                <Link href={`/department/authors?discipline=${w.discipline.id}&lang=${w.language}`} className={buttonClass('secondary', 'sm')}>
                  {t('reports.dept.assign')}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t('nav.readiness')}>
        <DataTable
          fileName="readiness"
          columns={[
            { key: 'course', header: t('common.course') },
            { key: 'code', header: t('common.code') },
            { key: 'lang', header: t('common.language'), filter: true },
            { key: 'status', header: t('common.status'), filter: true },
            { key: 'lessons', header: t('common.lessons'), align: 'right' },
            { key: 'videos', header: t('common.videos'), align: 'right' },
            { key: 'authors', header: t('reports.dept.authors') },
            { key: 'streams', header: t('reports.dept.streams'), align: 'right' },
          ]}
          rows={rows.map((r) => ({
            id: r.course.id,
            href: `/department/courses/${r.course.id}`,
            cells: {
              course: r.course.title,
              code: r.discipline.code,
              lang: r.course.language.toUpperCase(),
              status: { v: t(`statuses.course.${r.course.status}`), node: <Badge tone={COURSE_TONE[r.course.status]}>{t(`statuses.course.${r.course.status}`)}</Badge> },
              lessons: r.lessons,
              videos: { v: r.videos.ready, node: `${r.videos.ready}/${r.videos.total}` },
              authors: r.authors.map(shortName).join(', ') || '—',
              streams: r.streams,
            },
          }))}
        />
      </Section>
    </div>
  );
}
