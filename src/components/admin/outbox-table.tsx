'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, RefreshCw } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import { approveOutboxEvent, queueFinalGrades, retryOutboxEvent } from '@/server/actions/admin';
import { fmtDateTime } from '@/lib/utils';

const EVENT_LABELS: Record<string, string> = {
  CURRENT_CONTROL_SCORES: 'Баллы текущего контроля',
  MIDTERM_RESULTS: 'Результаты РК',
  FINAL_GRADES: 'Итоговые оценки',
  ATTENDANCE: 'Участие и посещаемость',
};

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  SENDING: 'brand',
  SENT: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};

export interface OutboxEvent {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  requiresApproval: boolean;
  approvedAt: string | null;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string;
}

/**
 * Раздел 9.1. Очередь исходящих событий.
 * Передача итоговых оценок требует явного подтверждения офиса регистратора.
 */
export function OutboxTable({
  events,
  courses,
  canApprove,
  canRetry,
  platonusEnabled,
  locale,
}: {
  events: OutboxEvent[];
  courses: { id: string; label: string; period: string; count: number }[];
  canApprove: boolean;
  canRetry: boolean;
  platonusEnabled: boolean;
  locale: string;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [courseId, setCourseId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function queue() {
    if (!courseId) return;
    startTransition(async () => {
      const count = await queueFinalGrades(courseId);
      setMessage(
        count > 0
          ? `Событие поставлено в очередь: ${count} итоговых оценок. Требуется подтверждение перед отправкой.`
          : 'Нет утверждённых итоговых оценок либо не задано сопоставление идентификаторов Platonus.'
      );
    });
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone="info">{message}</Alert>}

      {canApprove && courses.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('approveFinalGrades')}</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-fg-muted">
              Передача итоговых оценок выполняется по явному подтверждению офиса регистратора,
              а не автоматически (раздел 9.1, п. 5 ТЗ).
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                className="max-w-96"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                <option value="">— выберите курс —</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.period} ({c.count} оценок)
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={queue} disabled={!courseId || pending}>
                Поставить в очередь
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('outboxQueue')} ({events.length})</CardTitle>
          {!platonusEnabled && (
            <Badge tone="warning">Отправка приостановлена: API не настроен</Badge>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {events.length === 0 ? (
            <EmptyState title="Очередь пуста" />
          ) : (
            <div className="scroll-x max-h-96 overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Тип события</th>
                    <th>Статус</th>
                    <th className="text-right">Попыток</th>
                    <th>Создано</th>
                    <th>Отправлено</th>
                    <th>Ошибка</th>
                    <th>{tc('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-normal">
                        {EVENT_LABELS[e.eventType] ?? e.eventType}
                        {e.requiresApproval && (
                          <Badge tone={e.approvedAt ? 'success' : 'warning'} className="ml-2">
                            {e.approvedAt ? 'подтверждено' : 'ожидает подтверждения'}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[e.status] ?? 'neutral'}>{e.status}</Badge>
                      </td>
                      <td className="text-right tabular-nums">
                        {e.attempts} / {e.maxAttempts}
                      </td>
                      <td className="text-fg-muted">{fmtDateTime(e.createdAt, locale)}</td>
                      <td className="text-fg-muted">{fmtDateTime(e.sentAt, locale)}</td>
                      <td className="max-w-64 whitespace-normal text-xs text-danger">
                        {e.lastError ?? '—'}
                      </td>
                      <td>
                        <span className="flex gap-1">
                          {canApprove && e.requiresApproval && !e.approvedAt && (
                            <button
                              type="button"
                              title="Подтвердить отправку"
                              aria-label="Подтвердить отправку"
                              className="p-1 text-fg-muted hover:text-success"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  await approveOutboxEvent(e.id);
                                  window.location.reload();
                                })
                              }
                            >
                              <CheckCircle2 size={14} aria-hidden />
                            </button>
                          )}
                          {canRetry && (e.status === 'FAILED' || e.status === 'CANCELLED') && (
                            <button
                              type="button"
                              title="Повторить отправку"
                              aria-label="Повторить отправку"
                              className="p-1 text-fg-muted hover:text-brand"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  await retryOutboxEvent(e.id);
                                  window.location.reload();
                                })
                              }
                            >
                              <RefreshCw size={14} aria-hidden />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
