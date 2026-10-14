import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { syncRuns } from '@/db/schema';
import { runIssues } from '@/lib/registrar';
import { SYNC_TONE } from '@/lib/tones';
import { isUuid } from '@/lib/utils';

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isUuid(runId)) notFound();
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, runId));
  if (!run) notFound();
  const issues = await runIssues(runId);
  const text = (i: { code: string; params?: Record<string, string | number> }) => t(`registrar.issue.${i.code as 'required'}`, { column: '', value: '', row: '', message: '', ...(i.params ?? {}) });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${t(`registrar.kind.${run.kind}`)} · ${format.dateTime(run.startedAt, { dateStyle: 'medium', timeStyle: 'short' })}`}
        back={{ href: '/registrar/history', label: t('registrar.history.title') }}
      />
      <Card className="mb-5 flex flex-wrap items-center gap-4 p-4 text-sm">
        <Badge tone={SYNC_TONE[run.status]}>{t(`statuses.sync.${run.status}`)}</Badge>
        <span>{run.fileName}</span>
        <span>
          {t('registrar.action.create')}: <b>{run.counters.created}</b>
        </span>
        <span>
          {t('registrar.action.update')}: <b>{run.counters.updated}</b>
        </span>
        <span>
          {t('registrar.action.same')}: <b>{run.counters.skipped}</b>
        </span>
        <span className="text-danger">
          {t('registrar.action.error')}: <b>{run.counters.errors}</b>
        </span>
      </Card>
      <h2 className="mb-3 text-lg font-semibold">{t('registrar.history.issues')}</h2>
      <DataTable
        fileName="sync_issues"
        emptyText={t('registrar.history.noIssues')}
        columns={[
          { key: 'row', header: '#', align: 'right' },
          { key: 'label', header: t('common.name') },
          { key: 'problem', header: t('registrar.history.issues') },
        ]}
        rows={issues.map((i) => {
          const p = (i.payload ?? {}) as { label?: string; issues?: { code: string; params?: Record<string, string> }[]; message?: string };
          return {
            id: i.id,
            cells: {
              row: i.rowNo,
              label: p.label ?? '',
              problem: p.message ? t('registrar.issue.exception', { message: p.message }) : (p.issues ?? [{ code: i.problem }]).map(text).join('; '),
            },
          };
        })}
      />
    </div>
  );
}
