'use client';

import { useState, useTransition } from 'react';
import { CalendarDays, CheckCircle2, NotebookPen } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import { PRACTICE_KIND_LABELS, PLACEMENT_STATUS_LABELS } from '@/domain/attestation';
import type { PracticeKindCode, PlacementStatusCode } from '@/domain/attestation';
import { saveDiaryEntry } from '@/server/actions/attestation';

export interface DiaryEntryRow {
  id: string;
  entryDate: string;
  content: string;
  hours: number | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  comment: string | null;
}

export interface StudentPlacementRow {
  id: string;
  kind: PracticeKindCode;
  status: PlacementStatusCode;
  baseName: string | null;
  baseAddress: string | null;
  contactPerson: string | null;
  startsOn: string;
  endsOn: string;
  credits: number;
  supervisorName: string | null;
  supervisorBaseName: string | null;
  entries: DiaryEntryRow[];
  reportScore: number | null;
  reportLetter: string | null;
  reviewUniv: string | null;
  reviewBase: string | null;
}

/**
 * F-PRC-04. Дневник практики со стороны обучающегося.
 *
 * Дневник ведёт сам обучающийся: запись за день, часы и описание работы.
 * Правка записи снимает отметку проверки — руководитель проверял другой
 * текст, поэтому «проверено» после правки показывать нельзя.
 */
export function PracticeDiary({ placements }: { placements: StudentPlacementRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (placements.length === 0) {
    return (
      <EmptyState
        title="Практика не назначена"
        description="Распределение на базу практики оформляет офис Регистратора. После распределения здесь появится дневник."
      />
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {placements.map((p) => {
        const closed = p.status === 'GRADED' || p.status === 'CANCELLED';
        const hours = p.entries.reduce((sum, e) => sum + (e.hours ?? 0), 0);

        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <NotebookPen size={16} className="text-fg-muted" aria-hidden />
                Практика {PRACTICE_KIND_LABELS[p.kind]}
              </CardTitle>
              <Badge tone={p.status === 'GRADED' ? 'success' : closed ? 'neutral' : 'brand'}>
                {PLACEMENT_STATUS_LABELS[p.status]}
              </Badge>
            </CardHeader>

            <CardBody className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-fg-muted">База практики</dt>
                  <dd className="font-medium">{p.baseName ?? '—'}</dd>
                  {p.baseAddress && <dd className="text-xs text-fg-muted">{p.baseAddress}</dd>}
                </div>
                <div>
                  <dt className="text-fg-muted">Сроки</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <CalendarDays size={14} aria-hidden /> {p.startsOn} — {p.endsOn}
                  </dd>
                  <dd className="text-xs text-fg-muted">{p.credits} кредитов</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">Руководитель от вуза</dt>
                  <dd className="font-medium">{p.supervisorName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-fg-muted">Руководитель от организации</dt>
                  <dd className="font-medium">{p.supervisorBaseName ?? p.contactPerson ?? '—'}</dd>
                </div>
              </dl>

              {p.reportScore != null && (
                <Alert tone="success" title={`Отчёт оценён: ${p.reportScore} баллов${p.reportLetter ? ` (${p.reportLetter})` : ''}`}>
                  {p.reviewUniv || p.reviewBase ? (
                    <span className="block space-y-1">
                      {p.reviewUniv && <span className="block">Отзыв вуза: {p.reviewUniv}</span>}
                      {p.reviewBase && <span className="block">Отзыв организации: {p.reviewBase}</span>}
                    </span>
                  ) : (
                    'Кредиты практики учтены в общем прогрессе освоения программы.'
                  )}
                </Alert>
              )}

              {!closed && (
                <form
                  action={(fd) => {
                    setError(null);
                    startTransition(async () => {
                      const result = await saveDiaryEntry({
                        placementId: p.id,
                        entryDate: String(fd.get('entryDate') ?? ''),
                        content: String(fd.get('content') ?? ''),
                        hours: fd.get('hours') ? Number(fd.get('hours')) : undefined,
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                  className="grid gap-3 rounded-xl border border-border bg-surface-2 p-4 sm:grid-cols-[10rem_7rem_1fr_auto]"
                >
                  <Field label="Дата" required>
                    <Input
                      name="entryDate"
                      type="date"
                      required
                      min={p.startsOn}
                      max={p.endsOn}
                      defaultValue={p.startsOn}
                    />
                  </Field>
                  <Field label="Часы">
                    <Input name="hours" type="number" min="0" max="24" step="0.5" />
                  </Field>
                  <Field label="Выполненная работа" required>
                    <Textarea name="content" required rows={2} maxLength={4000} />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" disabled={pending}>
                      Записать
                    </Button>
                  </div>
                </form>
              )}

              {p.entries.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  Записей пока нет. Первая запись переводит практику в состояние «проходит практику».
                </p>
              ) : (
                <div className="scroll-x">
                  <table className="table-dense">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th className="text-right">Часы</th>
                        <th>Работа</th>
                        <th>Проверка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.entries.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap">{e.entryDate}</td>
                          <td className="text-right tabular-nums">{e.hours ?? '—'}</td>
                          <td className="whitespace-normal">
                            {e.content}
                            {e.comment && (
                              <span className="mt-1 block text-xs text-fg-muted">
                                Замечание: {e.comment}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap text-xs">
                            {e.reviewedAt ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <CheckCircle2 size={13} aria-hidden />
                                {e.reviewedByName ?? 'проверено'}
                              </span>
                            ) : (
                              <span className="text-fg-muted">не проверена</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td>Итого</td>
                        <td className="text-right tabular-nums">{hours || '—'}</td>
                        <td colSpan={2}>{p.entries.length} записей</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
