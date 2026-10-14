'use client';

import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/input';
import { FORMATS, IMPORT_KINDS, type ImportKind } from '@/lib/platonus/formats';
import { cn } from '@/lib/utils';
import { applyImportAction, planImportAction, type PlanSummary } from '@/server/registrar-actions';

const ACTION_TONE: Record<string, Tone> = { create: 'success', update: 'info', same: 'neutral', error: 'danger' };

export function ImportWizard({ initialKind }: { initialKind?: ImportKind }) {
  const t = useTranslations('registrar');
  const tc = useTranslations('common');
  const [kind, setKind] = useState<ImportKind>(initialKind ?? 'students');
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [dropMissing, setDropMissing] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const issueText = (i: { code: string; params?: Record<string, string | number> }) =>
    t(`issue.${i.code as 'required'}`, { column: '', value: '', row: '', message: '', ...(i.params ?? {}) });

  function check(f: File) {
    setFile(f);
    setPlan(null);
    setResult(null);
    const fd = new FormData();
    fd.append('file', f);
    start(async () => {
      const res = await planImportAction(kind, fd);
      if ('error' in res) {
        toast.error(res.error === 'xls' ? t('import.xlsNote') : tc('somethingWrong'));
        return;
      }
      setPlan(res);
    });
  }

  function apply() {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    start(async () => {
      const res = await applyImportAction(kind, fd, dropMissing);
      if ('error' in res) {
        toast.error(tc('somethingWrong'));
        return;
      }
      setResult(res.counters);
      setPlan(null);
    });
  }

  function reset() {
    setFile(null);
    setPlan(null);
    setResult(null);
    if (input.current) input.current.value = '';
  }

  const rows = plan ? (onlyErrors ? plan.rows.filter((r) => r.action === 'error') : plan.rows) : [];

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <p className="mb-1 font-semibold">{t('import.step1')}</p>
        <p className="mb-3 text-xs text-fg-muted">{t('import.order')}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {IMPORT_KINDS.map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                reset();
              }}
              className={cn('flex min-h-14 items-start gap-2 rounded-lg border p-3 text-left', k === kind ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:border-brand/40')}
            >
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', k === kind ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-fg-muted')}>{i + 1}</span>
              <span>
                <span className="block text-sm font-semibold">{t(`kind.${k}`)}</span>
                <span className="block text-xs text-fg-muted">{t(`kindHint.${k}`)}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-1 font-semibold">{t('import.step2')}</p>
        <p className="mb-3 text-sm text-fg-muted">
          {t('import.columns')} ({t('import.requiredCols')}):{' '}
          <code className="text-xs break-words">
            {FORMATS[kind].map((c) => `${c.key}${c.required ? '*' : ''}`).join(', ')}
          </code>
        </p>
        <div className="flex flex-wrap gap-2">
          <label className={buttonClass('primary')}>
            {pending && !plan ? <Loader2 className="animate-spin" /> : <Upload />}
            {t('import.choose')}
            <input ref={input} type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
          </label>
          <a href={`/api/templates/${kind}`} className={buttonClass('ghost')}>
            <Download />
            {t('import.template')}
          </a>
        </div>
        {file && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-fg-muted" />
            {file.name}
          </p>
        )}
      </Card>

      {plan && (
        <Card className="p-5">
          <p className="mb-2 font-semibold">{t('import.step3')}</p>
          {plan.fileIssues.length > 0 ? (
            <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              <p className="font-semibold">{t('import.fileErrors')}</p>
              <ul className="mt-1 list-disc pl-5">
                {plan.fileIssues.map((i, k) => (
                  <li key={k}>{issueText(i)}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['created', 'updated', 'skipped', 'errors'] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-border p-3">
                    <p className="text-xs text-fg-muted">{t(`action.${k === 'created' ? 'create' : k === 'updated' ? 'update' : k === 'skipped' ? 'same' : 'error'}`)}</p>
                    <p className={cn('text-2xl font-bold tabular-nums', k === 'errors' && plan.counters.errors > 0 && 'text-danger')}>{plan.counters[k]}</p>
                  </div>
                ))}
              </div>
              {kind === 'enrollments' && <Checkbox checked={dropMissing} onChange={(e) => setDropMissing(e.target.checked)} label={t('import.dropMissing')} className="mb-2" />}
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={apply} disabled={pending || plan.counters.created + plan.counters.updated === 0}>
                  {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {plan.counters.errors ? t('import.applyWithErrors') : t('import.apply')}
                </Button>
                {plan.counters.errors > 0 && <Checkbox checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} label={t('action.error')} />}
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNo} className="border-b border-border last:border-0">
                        <td className="w-16 px-3 py-2 text-fg-muted tabular-nums">{r.rowNo}</td>
                        <td className="px-3 py-2">
                          <Badge tone={ACTION_TONE[r.action]}>{t(`action.${r.action}`)}</Badge>
                        </td>
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2 text-danger">{r.issues.map(issueText).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.rows.length < plan.counters.total && <p className="mt-2 text-xs text-fg-muted">{t('import.showing', { n: plan.rows.length })}</p>}
            </>
          )}
        </Card>
      )}

      {result && (
        <Card className="border-success/30 p-5">
          <p className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" />
            {t('import.done', result)}
          </p>
          {kind === 'students' && result.created > 0 && <p className="mt-1 text-sm">{t('import.passwordsHint')}</p>}
          <Button variant="secondary" className="mt-3" onClick={reset}>
            {t('import.another')}
          </Button>
        </Card>
      )}
    </div>
  );
}
