'use client';

import { useState, useTransition } from 'react';
import { Scale } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Textarea, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { fileAppeal, withdrawAppeal } from '@/server/actions/assessment';

export interface AppealView {
  id: string;
  status: string;
  reason: string;
  decision: string | null;
  letterBefore: string | null;
  letterAfter: string | null;
  filedAt: string;
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }> = {
  FILED: { label: 'подана', tone: 'brand' },
  IN_REVIEW: { label: 'на рассмотрении комиссии', tone: 'brand' },
  UPHELD: { label: 'удовлетворена', tone: 'success' },
  REJECTED: { label: 'отклонена', tone: 'danger' },
  WITHDRAWN: { label: 'отозвана', tone: 'neutral' },
};

/**
 * F-ASM-04. Подача апелляции на итоговую оценку.
 *
 * Форма живёт прямо в карточке дисциплины журнала: апеллируют на конкретную
 * оценку, и отдельный раздел заставлял бы искать её заново.
 */
export function AppealForm({
  periodGradeId,
  disciplineName,
  canFile,
  appeals,
}: {
  periodGradeId: string;
  disciplineName: string;
  /** Ведомость закрыта и срок подачи не истёк */
  canFile: boolean;
  appeals: AppealView[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = appeals.find((a) => a.status === 'FILED' || a.status === 'IN_REVIEW');

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (appeals.length === 0 && !canFile) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      {error && (
        <Alert tone="danger" className="mb-2">
          {error}
        </Alert>
      )}

      {appeals.length > 0 && (
        <ul className="mb-2 space-y-2">
          {appeals.map((a) => (
            <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Scale size={14} className="text-fg-muted" aria-hidden />
                <span className="font-medium">Апелляция</span>
                <Badge tone={STATUS[a.status]?.tone ?? 'neutral'}>
                  {STATUS[a.status]?.label ?? a.status}
                </Badge>
                <span className="text-xs text-fg-muted">
                  от {new Date(a.filedAt).toLocaleDateString('ru-RU')}
                </span>
                {a.letterAfter && a.letterBefore && (
                  <span className="text-xs">
                    <span className="text-fg-muted line-through">{a.letterBefore}</span>
                    {' → '}
                    <span className="font-medium text-success">{a.letterAfter}</span>
                  </span>
                )}
              </div>
              <p className="text-fg-muted">{a.reason}</p>
              {a.decision && (
                <p className="mt-1.5 border-l-2 border-brand/40 pl-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                    Решение комиссии:{' '}
                  </span>
                  {a.decision}
                </p>
              )}
              {a.status === 'FILED' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1.5"
                  disabled={pending}
                  onClick={() => run(() => withdrawAppeal(a.id))}
                >
                  Отозвать
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canFile && !active && (
        <>
          {!open ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Scale size={14} aria-hidden /> Подать апелляцию
            </Button>
          ) : (
            <form
              action={(fd) =>
                run(() =>
                  fileAppeal({
                    periodGradeId,
                    reason: String(fd.get('reason') ?? ''),
                  })
                )
              }
              className="space-y-2"
            >
              <Field
                label={`Основание апелляции по дисциплине «${disciplineName}»`}
                hint="Опишите, с чем вы не согласны и почему. Апелляцию рассматривает комиссия."
                required
              >
                <Textarea name="reason" required minLength={20} rows={3} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Подать
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
