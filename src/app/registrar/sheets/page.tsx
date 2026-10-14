import { Download, FileSpreadsheet } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { BatchActions, MarkAllSent } from '@/components/registrar/batch-actions';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, PageHeader, Tabs } from '@/components/ui/page';
import type { BatchStatus } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { batchesByStatus } from '@/lib/registrar';
import { BATCH_TONE } from '@/lib/tones';
import { shortName } from '@/lib/utils';

const TABS: { key: string; statuses: BatchStatus[] }[] = [
  { key: 'ready', statuses: ['ready'] },
  { key: 'sent', statuses: ['sent'] },
  { key: 'confirmed', statuses: ['confirmed'] },
  { key: 'rejected', statuses: ['rejected'] },
];

export default async function RegistrarSheets({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'ready' } = await searchParams;
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const current = TABS.find((x) => x.key === tab) ?? TABS[0];
  const list = await batchesByStatus(current.statuses);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={t('registrar.sheets.title')}
        description={t('registrar.sheets.subtitle')}
        actions={
          current.key === 'ready' && list.length > 0 ? (
            <>
              <a href="/api/export/ready" className={buttonClass('primary')}>
                <Download />
                {t('registrar.sheets.downloadAll')}
              </a>
              <MarkAllSent count={list.length} />
            </>
          ) : undefined
        }
      />
      <Tabs active={`/registrar/sheets?tab=${current.key}`} items={TABS.map((x) => ({ href: `/registrar/sheets?tab=${x.key}`, label: t(`statuses.batch.${x.key as BatchStatus}`) }))} />
      {list.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet />} title={t('registrar.sheets.empty')} />
      ) : (
        <DataTable
          fileName={`sheets_${current.key}`}
          columns={[
            { key: 'discipline', header: t('common.discipline') },
            { key: 'stream', header: t('common.stream') },
            { key: 'teacher', header: t('common.teacher'), filter: true },
            { key: 'component', header: t('teach.journal.component'), filter: true },
            { key: 'rows', header: t('registrar.history.counters'), align: 'right' },
            { key: 'date', header: t('common.date') },
            { key: 'status', header: t('common.status') },
            { key: 'actions', header: '', noExport: true, align: 'right' },
          ]}
          rows={list.map((b) => ({
            id: b.batch.id,
            cells: {
              discipline: `${b.discipline.code} · ${pickName(b.discipline, locale)}`,
              stream: b.offering.stream,
              teacher: b.teacher?.lastName ? shortName(b.teacher) : '—',
              component: { v: t(`enums.component.${b.batch.component}`), node: <span>{t(`enums.component.${b.batch.component}`)}{b.batch.comment === 'correction' && <Badge tone="warning" className="ml-1">{t('registrar.sheets.correction')}</Badge>}</span> },
              rows: b.rows,
              date: { v: b.batch.createdAt.toISOString(), node: format.dateTime(b.batch.teacherConfirmedAt ?? b.batch.createdAt, { dateStyle: 'medium' }) },
              status: {
                v: t(`statuses.batch.${b.batch.status}`),
                node: (
                  <span>
                    <Badge tone={BATCH_TONE[b.batch.status]}>{t(`statuses.batch.${b.batch.status}`)}</Badge>
                    {b.batch.status === 'rejected' && b.batch.comment && <span className="block text-xs text-danger">{b.batch.comment}</span>}
                  </span>
                ),
              },
              actions: {
                v: null,
                node: (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <a href={`/api/export/batch/${b.batch.id}`} className={buttonClass('ghost', 'sm')}>
                      <Download />
                      XLSX
                    </a>
                    <a href={`/api/export/batch/${b.batch.id}?format=csv`} className={buttonClass('ghost', 'sm')}>
                      CSV
                    </a>
                    <BatchActions id={b.batch.id} status={b.batch.status} />
                  </div>
                ),
              },
            },
          }))}
        />
      )}
    </div>
  );
}
