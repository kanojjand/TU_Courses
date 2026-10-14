import { CheckCircle2 } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, PageHeader } from '@/components/ui/page';
import type { BatchStatus } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { offeringStats, unclosedSheets } from '@/lib/analytics';
import { requireUser } from '@/lib/auth';
import { departmentScope } from '@/lib/rbac';
import { BATCH_TONE } from '@/lib/tones';
import { shortName } from '@/lib/utils';

export default async function UnclosedSheets() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const list = await unclosedSheets(await offeringStats(await departmentScope(user, 'dean')));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.dean.unclosedTitle')} description={t('reports.dean.unclosedHint')} />
      {list.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title={t('reports.dean.noUnclosed')} />
      ) : (
        <DataTable
          fileName="unclosed_sheets"
          columns={[
            { key: 'discipline', header: t('common.discipline') },
            { key: 'stream', header: t('common.stream') },
            { key: 'teacher', header: t('common.teacher'), filter: true },
            { key: 'component', header: t('teach.journal.component'), filter: true },
            { key: 'ended', header: t('reports.dean.windowEnded') },
            { key: 'status', header: t('common.status'), filter: true },
          ]}
          rows={list.map((u, i) => ({
            id: `${u.stat.offering.id}-${u.component}-${i}`,
            href: `/streams/${u.stat.offering.id}`,
            cells: {
              discipline: `${u.stat.discipline.code} · ${pickName(u.stat.discipline, locale)}`,
              stream: u.stat.offering.stream,
              teacher: u.stat.teacher ? shortName(u.stat.teacher) : '—',
              component: t(`enums.component.${u.component as 'TK1'}`),
              ended: { v: u.windowEnd.toISOString(), node: format.dateTime(u.windowEnd, { dateStyle: 'medium' }) },
              status: {
                v: u.status ? t(`statuses.batch.${u.status as BatchStatus}`) : t('teach.sheets.notCreated'),
                node: u.status ? <Badge tone={BATCH_TONE[u.status as BatchStatus]}>{t(`statuses.batch.${u.status as BatchStatus}`)}</Badge> : <Badge tone="danger">{t('teach.sheets.notCreated')}</Badge>,
              },
            },
          }))}
        />
      )}
    </div>
  );
}
