import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { recentRuns } from '@/lib/registrar';
import { SYNC_TONE } from '@/lib/tones';
import { shortName } from '@/lib/utils';

export default async function HistoryPage() {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const runs = await recentRuns(500);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('registrar.history.title')} />
      <DataTable
        fileName="sync_history"
        columns={[
          { key: 'date', header: t('common.date') },
          { key: 'kind', header: t('common.name'), filter: true },
          { key: 'dir', header: t('registrar.history.direction'), filter: true },
          { key: 'file', header: t('registrar.history.file') },
          { key: 'who', header: t('registrar.history.who'), filter: true },
          { key: 'res', header: t('registrar.history.counters') },
          { key: 'status', header: t('common.status'), filter: true },
        ]}
        rows={runs.map(({ run, by }) => ({
          id: run.id,
          href: `/registrar/history/${run.id}`,
          tone: run.status === 'failed' ? 'danger' : run.status === 'partial' ? 'warning' : undefined,
          cells: {
            date: { v: run.startedAt.toISOString(), node: format.dateTime(run.startedAt, { dateStyle: 'medium', timeStyle: 'short' }) },
            kind: t(`registrar.kind.${run.kind}`),
            dir: run.direction === 'in' ? t('registrar.history.in') : t('registrar.history.out'),
            file: run.fileName ?? run.method,
            who: by?.lastName ? shortName(by) : '—',
            res: `${run.counters.total} / +${run.counters.created} / ~${run.counters.updated} / !${run.counters.errors}`,
            status: { v: t(`statuses.sync.${run.status}`), node: <Badge tone={SYNC_TONE[run.status]}>{t(`statuses.sync.${run.status}`)}</Badge> },
          },
        }))}
      />
    </div>
  );
}
