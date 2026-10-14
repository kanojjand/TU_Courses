import { ArrowRight, FileSpreadsheet, Inbox, Upload } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, PageHeader, Section, Stat } from '@/components/ui/page';
import { platonusApiConfigured } from '@/lib/platonus/adapter';
import { recentRuns, registrarCounters } from '@/lib/registrar';
import { SYNC_TONE } from '@/lib/tones';
import { shortName } from '@/lib/utils';

export default async function RegistrarHome() {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const [runs, counters] = await Promise.all([recentRuns(8), registrarCounters()]);
  const api = platonusApiConfigured();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('registrar.title')}
        description={t('registrar.subtitle')}
        actions={
          <Link href="/registrar/import" className={buttonClass('primary')}>
            <Upload />
            {t('nav.import')}
          </Link>
        }
      />
      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('registrar.readySheets')} value={counters.ready} tone={counters.ready ? 'brand' : undefined} href="/registrar/sheets" />
        <Stat label={t('registrar.pendingRequests')} value={counters.pending} tone={counters.pending ? 'warning' : undefined} href="/registrar/requests" />
        <Stat label={t('registrar.mode')} value={<span className="text-lg">{api ? t('registrar.modeApi') : t('registrar.modeFile')}</span>} />
      </div>
      <Section
        title={t('registrar.lastRuns')}
        action={
          <Link href="/registrar/history" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            {t('nav.syncHistory')}
            <ArrowRight className="size-4" />
          </Link>
        }
      >
        {runs.length === 0 ? (
          <EmptyState icon={<FileSpreadsheet />} title={t('registrar.noRuns')} />
        ) : (
          <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
            {runs.map(({ run, by }) => (
              <li key={run.id}>
                <Link href={`/registrar/history/${run.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-surface-2/60">
                  <Badge tone={SYNC_TONE[run.status]}>{t(`statuses.sync.${run.status}`)}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t(`registrar.kind.${run.kind}`)} · {run.direction === 'in' ? t('registrar.history.in') : t('registrar.history.out')}
                    </p>
                    <p className="truncate text-sm text-fg-muted">
                      {format.dateTime(run.startedAt, { dateStyle: 'medium', timeStyle: 'short' })} · {run.fileName ?? run.method} {by?.lastName ? `· ${shortName(by)}` : ''}
                    </p>
                  </div>
                  <span className="text-sm text-fg-muted">
                    +{run.counters.created} / ~{run.counters.updated}
                    {run.counters.errors > 0 && <span className="ml-2 font-medium text-danger">{t('registrar.errorsN', { n: run.counters.errors })}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="flex flex-wrap gap-2">
        <Link href="/registrar/sheets" className={buttonClass('secondary')}>
          <FileSpreadsheet />
          {t('nav.sheets')}
        </Link>
        <Link href="/registrar/requests" className={buttonClass('secondary')}>
          <Inbox />
          {t('nav.requests')}
        </Link>
      </div>
    </div>
  );
}
