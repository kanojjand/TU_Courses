'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge, gradeTone } from '@/components/ui/badge';
import {
  closeSheet, createGradeItem, deleteGradeItem, reopenSheet, setGradeCell,
} from '@/server/actions/gradebook';
import type { GradeConfigSpec, ControlPeriodCode } from '@/domain/grading';
import { fmtScore } from '@/lib/utils';

export interface GradebookItem {
  id: string;
  title: string;
  controlPeriod: string;
  maxScore: number;
  weight: number;
  isAutoGraded: boolean;
}

export interface GradebookRow {
  studentId: string;
  fullName: string;
  group: string;
  scores: Record<string, number | null>;
  rk1: number | null;
  rk2: number | null;
  admissionScore: number | null;
  isAdmitted: boolean;
  examScore: number | null;
  finalScore: number | null;
  letter: string | null;
  gpaPoints: number | null;
  traditional: string | null;
}

const CONTROL_LABELS: Record<string, string> = {
  RK1: 'РК1',
  RK2: 'РК2',
  EXAM: 'Экзамен',
};

/**
 * F-T-12. Сводная таблица с прямым редактированием ячеек и автоматическим
 * расчётом РК1, РК2, допуска и итога.
 *
 * После закрытия ведомости правка блокируется (раздел 3).
 */
export function Gradebook({
  courseId,
  items,
  rows: initialRows,
  sheets,
  config,
  canClose,
  canReopen,
  readOnly,
  locale,
}: {
  courseId: string;
  items: GradebookItem[];
  rows: GradebookRow[];
  sheets: { controlPeriod: string; status: string; closedAt: Date | null }[];
  config: GradeConfigSpec;
  canClose: boolean;
  canReopen: boolean;
  readOnly: boolean;
  locale: string;
}) {
  const t = useTranslations('grades');
  const tc = useTranslations('common');
  const [rows, setRows] = useState(initialRows);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const closedPeriods = new Set(
    sheets.filter((s) => s.status === 'CLOSED').map((s) => s.controlPeriod)
  );

  function saveCell(studentId: string, itemId: string, raw: string, controlPeriod: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;

    let reason: string | undefined;
    if (closedPeriods.has(controlPeriod)) {
      const input = prompt(
        'Ведомость закрыта. Укажите основание корректировки (не менее 10 символов):'
      );
      if (!input || input.trim().length < 10) {
        setMessage({ tone: 'danger', text: 'Корректировка отменена: основание не указано.' });
        return;
      }
      reason = input.trim();
    }

    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId ? { ...r, scores: { ...r.scores, [itemId]: value } } : r
      )
    );

    startTransition(async () => {
      try {
        await setGradeCell({ gradeItemId: itemId, studentId, score: value, reason });
        setMessage(null);
        window.location.reload();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  function addItem(formData: FormData) {
    startTransition(async () => {
      try {
        await createGradeItem({
          courseId,
          title: String(formData.get('title') ?? ''),
          controlPeriod: formData.get('controlPeriod') as ControlPeriodCode,
          maxScore: Number(formData.get('maxScore') ?? 100),
          weight: Number(formData.get('weight') ?? 100),
        });
        window.location.reload();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  const periods: ControlPeriodCode[] =
    config.midtermCount >= 2 ? ['RK1', 'RK2', 'EXAM'] : ['RK1', 'EXAM'];

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Alert tone="info">
        Итоговый балл = рейтинг допуска × {config.admissionWeight} + экзамен ×{' '}
        {config.examWeight}. Порог допуска — {config.admissionThreshold} баллов.
        Коэффициенты задаются академической политикой вуза в настройках системы.
      </Alert>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Ведомости</CardTitle>
          <div className="flex flex-wrap gap-2">
            {periods.map((p) => {
              const sheet = sheets.find((s) => s.controlPeriod === p);
              const closed = sheet?.status === 'CLOSED';
              return (
                <span key={p} className="flex items-center gap-1">
                  <a href={`/api/export/gradesheet?courseId=${courseId}&control=${p}`} download>
                    <Button size="sm" variant="ghost">
                      <Download size={14} aria-hidden /> {CONTROL_LABELS[p]}
                    </Button>
                  </a>
                  {closed ? (
                    canReopen && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          const reason = prompt('Основание для открытия ведомости:');
                          if (!reason || reason.trim().length < 10) return;
                          startTransition(async () => {
                            await reopenSheet(courseId, p, reason.trim());
                            window.location.reload();
                          });
                        }}
                      >
                        <LockOpen size={14} aria-hidden />
                      </Button>
                    )
                  ) : (
                    canClose && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`Закрыть ведомость ${CONTROL_LABELS[p]}? После закрытия правка оценок будет невозможна.`))
                            return;
                          startTransition(async () => {
                            await closeSheet(courseId, p);
                            window.location.reload();
                          });
                        }}
                      >
                        <Lock size={14} aria-hidden />
                      </Button>
                    )
                  )}
                </span>
              );
            })}
          </div>
        </CardHeader>

        <CardBody>
          <div className="flex flex-wrap gap-2">
            {periods.map((p) => {
              const sheet = sheets.find((s) => s.controlPeriod === p);
              return (
                <Badge key={p} tone={sheet?.status === 'CLOSED' ? 'success' : 'neutral'}>
                  {CONTROL_LABELS[p]}: {sheet?.status === 'CLOSED' ? t('sheetClosed') : 'черновик'}
                </Badge>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Оценочные мероприятия ({items.length})</CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} aria-hidden /> Добавить
            </Button>
          )}
        </CardHeader>

        {adding && (
          <CardBody className="border-b border-border">
            <form action={addItem} className="grid gap-3 sm:grid-cols-4">
              <Field label="Название" required>
                <Input name="title" required maxLength={200} />
              </Field>
              <Field label="Период контроля" required>
                <Select name="controlPeriod" defaultValue="RK1">
                  {periods.map((p) => (
                    <option key={p} value={p}>{CONTROL_LABELS[p]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Максимальный балл" required>
                <Input name="maxScore" type="number" min="1" defaultValue="100" required />
              </Field>
              <Field label="Вес в периоде, %" required>
                <Input name="weight" type="number" min="0" max="100" defaultValue="100" required />
              </Field>
              <div className="sm:col-span-4">
                <Button type="submit" size="sm" disabled={pending}>{tc('add')}</Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="Нет зачисленных обучающихся"
              description="Регистрация на курс выполняется офисом регистратора."
            />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-muted">ФИО</th>
                    <th>Группа</th>
                    {items.map((i) => (
                      <th key={i.id} className="min-w-24">
                        <span className="block">{i.title}</span>
                        <span className="block font-normal normal-case opacity-70">
                          {CONTROL_LABELS[i.controlPeriod]} · макс. {i.maxScore} · вес {i.weight} %
                        </span>
                        {!readOnly && !i.isAutoGraded && (
                          <button
                            type="button"
                            aria-label={`Удалить мероприятие ${i.title}`}
                            className="mt-1 text-fg-muted hover:text-danger"
                            onClick={() => {
                              if (!confirm(`Удалить «${i.title}» со всеми баллами?`)) return;
                              startTransition(async () => {
                                await deleteGradeItem(i.id);
                                window.location.reload();
                              });
                            }}
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                        )}
                      </th>
                    ))}
                    <th>{t('rk1')}</th>
                    {config.midtermCount >= 2 && <th>{t('rk2')}</th>}
                    <th>{t('admission')}</th>
                    <th>{t('exam')}</th>
                    <th>{t('final')}</th>
                    <th>{t('letter')}</th>
                    <th>{t('gpaPoints')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.studentId}>
                      <td className="sticky left-0 z-10 whitespace-normal bg-surface font-medium">
                        {r.fullName}
                      </td>
                      <td className="text-fg-muted">{r.group}</td>

                      {items.map((i) => {
                        return (
                          <td key={i.id} className="p-0">
                            <input
                              type="number"
                              min={0}
                              max={i.maxScore}
                              step="0.5"
                              defaultValue={r.scores[i.id] ?? ''}
                              disabled={readOnly}
                              aria-label={`${r.fullName} — ${i.title}`}
                              title={
                                i.isAutoGraded
                                  ? 'Балл выставляется автоматически по результату теста или задания'
                                  : undefined
                              }
                              className="h-8 w-full border-0 bg-transparent px-2 text-right tabular-nums focus:bg-brand/8 disabled:opacity-60"
                              onBlur={(e) => {
                                const next = e.target.value;
                                const prev = r.scores[i.id];
                                if (next === (prev === null ? '' : String(prev))) return;
                                saveCell(r.studentId, i.id, next, i.controlPeriod);
                              }}
                            />
                          </td>
                        );
                      })}

                      <td className="text-right tabular-nums">{fmtScore(r.rk1, locale)}</td>
                      {config.midtermCount >= 2 && (
                        <td className="text-right tabular-nums">{fmtScore(r.rk2, locale)}</td>
                      )}
                      <td className="text-right tabular-nums">
                        {fmtScore(r.admissionScore, locale)}
                        {r.admissionScore !== null && (
                          <span className={r.isAdmitted ? 'ml-1 text-success' : 'ml-1 text-danger'}>
                            {r.isAdmitted ? '✓' : '✕'}
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{fmtScore(r.examScore, locale)}</td>
                      <td className="text-right font-semibold tabular-nums">
                        {fmtScore(r.finalScore, locale)}
                      </td>
                      <td className="text-center">
                        {r.letter && <Badge tone={gradeTone(r.letter)}>{r.letter}</Badge>}
                      </td>
                      <td className="text-right tabular-nums">{fmtScore(r.gpaPoints, locale)}</td>
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
