'use client';

import { useState, useTransition } from 'react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { approveIep, rejectIep, confirmIep } from '@/server/actions/iep';

export interface IepQueueRow {
  id: string;
  status: string;
  totalCredits: number;
  submittedAt: string | null;
  academicYearName: string;
  studentName: string;
  studyYear: number;
  groupName: string | null;
  programCode: string;
  itemCount: number;
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' }> = {
  DRAFT: { label: 'черновик', tone: 'neutral' },
  SUBMITTED: { label: 'ожидает согласования', tone: 'brand' },
  APPROVED: { label: 'согласован', tone: 'success' },
  REJECTED: { label: 'возвращён', tone: 'warning' },
  CONFIRMED: { label: 'зафиксирован', tone: 'success' },
};

/**
 * F-IEP-04. Очередь ИУП.
 *
 * Один компонент на два рабочих места: эдвайзер согласует или возвращает,
 * офис Регистратора фиксирует согласованный. Разделять их не за чем —
 * таблица и действия совпадают, отличается только набор кнопок.
 */
export function IepQueue({
  rows,
  mode,
  title,
}: {
  rows: IepQueueRow[];
  mode: 'advisor' | 'registrar';
  title: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRejecting(null);
      router.refresh();
    });
  }

  const waiting = rows.filter((r) =>
    mode === 'advisor' ? r.status === 'SUBMITTED' : r.status === 'APPROVED'
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {waiting > 0 && <Badge tone="brand">{waiting} ждёт действия</Badge>}
      </CardHeader>
      <CardBody className="space-y-3 p-0">
        {error && (
          <div className="px-5 pt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="ИУП нет"
              description={
                mode === 'advisor'
                  ? 'Планы появятся здесь, когда закреплённые обучающиеся отправят их на согласование.'
                  : 'Планы появятся здесь после согласования эдвайзером.'
              }
            />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Обучающийся</th>
                  <th>Группа</th>
                  <th>Курс</th>
                  <th>Год</th>
                  <th className="text-right">Дисциплин</th>
                  <th className="text-right">Кредитов</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-normal font-medium">{r.studentName}</td>
                    <td>{r.groupName ?? '—'}</td>
                    <td className="tabular-nums">{r.studyYear}</td>
                    <td className="whitespace-nowrap text-xs">{r.academicYearName}</td>
                    <td className="text-right tabular-nums">{r.itemCount}</td>
                    <td className="text-right tabular-nums">{r.totalCredits}</td>
                    <td>
                      <Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>
                        {STATUS[r.status]?.label ?? r.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {mode === 'advisor' && r.status === 'SUBMITTED' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => run(() => approveIep(r.id))}
                          >
                            Согласовать
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setRejecting((v) => (v === r.id ? null : r.id))}
                          >
                            Вернуть
                          </Button>
                        </div>
                      )}
                      {mode === 'registrar' && r.status === 'APPROVED' && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => confirmIep(r.id))}
                        >
                          Зафиксировать
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rejecting && (
          <div className="border-t border-border p-5">
            <form
              action={(formData) =>
                run(() =>
                  rejectIep({ iepId: rejecting, comment: String(formData.get('comment') ?? '') })
                )
              }
              className="space-y-2"
            >
              <Field label="Что нужно исправить" required>
                <Textarea name="comment" required minLength={10} rows={3} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="danger" disabled={pending}>
                  Вернуть на доработку
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
