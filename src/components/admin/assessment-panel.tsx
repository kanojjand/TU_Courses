'use client';

import { useState, useTransition } from 'react';
import { Award, CheckCircle2, Plus, Scale, XCircle } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import type { HonoursResult } from '@/domain/honours';
import {
  decideAppeal,
  saveCreditTransfer,
  approveCreditTransfer,
  deleteCreditTransfer,
} from '@/server/actions/assessment';

export interface AppealRow {
  id: string;
  status: string;
  reason: string;
  decision: string | null;
  filedAt: string;
  studentName: string;
  groupName: string | null;
  disciplineName: string;
  periodName: string;
  scoreBefore: number | null;
  letterBefore: string | null;
  letterAfter: string | null;
  decidedBy: string | null;
}

export interface TransferRow {
  id: string;
  sourceKind: string;
  sourceOrg: string | null;
  sourceDisciplineName: string;
  credits: number;
  letter: string | null;
  gpaPoint: number | null;
  documentRef: string | null;
  slotCode: string | null;
  disciplineName: string | null;
  approved: boolean;
  approvedBy: string | null;
}

const APPEAL_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }> = {
  FILED: { label: 'подана', tone: 'brand' },
  IN_REVIEW: { label: 'на рассмотрении', tone: 'brand' },
  UPHELD: { label: 'удовлетворена', tone: 'success' },
  REJECTED: { label: 'отклонена', tone: 'danger' },
  WITHDRAWN: { label: 'отозвана', tone: 'neutral' },
};

const SOURCE_KINDS: Record<string, string> = {
  TRANSFER: 'перевод из другой организации',
  REINSTATEMENT: 'восстановление',
  MOBILITY: 'академическая мобильность',
  NON_FORMAL: 'неформальное образование',
  PRIOR_EDU: 'предыдущее образование',
};

/**
 * F-ASM-04, F-ASM-09, F-ASM-10. Рабочее место офиса Регистратора.
 *
 * Три задачи в одном месте: очередь апелляций общая, а перезачёт и проверка
 * на диплом с отличием адресные — они относятся к конкретному обучающемуся.
 */
export function AssessmentPanel({
  students,
  selectedStudentId,
  appeals,
  transfers,
  honours,
  slots,
  disciplines,
  promotionThreshold,
}: {
  students: { id: string; name: string; groupName: string | null; programCode: string }[];
  selectedStudentId: string | null;
  appeals: AppealRow[];
  transfers: { totals: { creditsApproved: number; creditsInGpa: number }; rows: TransferRow[] } | null;
  honours: HonoursResult | null;
  slots: { id: string; label: string }[];
  disciplines: { id: string; label: string }[];
  promotionThreshold: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [addingTransfer, setAddingTransfer] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeciding(null);
      setAddingTransfer(false);
      router.refresh();
    });
  }

  const open = appeals.filter((a) => a.status === 'FILED' || a.status === 'IN_REVIEW');

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* ── Апелляции (F-ASM-04) ────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Scale size={16} className="text-fg-muted" aria-hidden />
            Апелляции ({appeals.length})
          </CardTitle>
          {open.length > 0 && <Badge tone="brand">{open.length} ждёт решения</Badge>}
        </CardHeader>
        <CardBody className="p-0">
          {appeals.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Апелляций нет"
                description="Апелляция подаётся обучающимся на итоговую оценку в установленный срок после закрытия ведомости."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Обучающийся</th>
                    <th>Дисциплина</th>
                    <th>Период</th>
                    <th className="text-right">Оценка</th>
                    <th>Основание</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {appeals.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{a.studentName}</span>
                        {a.groupName && (
                          <span className="block text-xs text-fg-muted">{a.groupName}</span>
                        )}
                      </td>
                      <td className="whitespace-normal">{a.disciplineName}</td>
                      <td className="text-xs">{a.periodName}</td>
                      <td className="text-right tabular-nums">
                        {a.letterBefore ?? '—'}
                        {a.letterAfter && (
                          <span className="text-success"> → {a.letterAfter}</span>
                        )}
                      </td>
                      <td className="max-w-xs whitespace-normal text-xs text-fg-muted">
                        {a.reason}
                        {a.decision && (
                          <span className="mt-1 block border-l-2 border-brand/40 pl-2 text-fg">
                            {a.decision}
                            {a.decidedBy && ` — ${a.decidedBy}`}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone={APPEAL_STATUS[a.status]?.tone ?? 'neutral'}>
                          {APPEAL_STATUS[a.status]?.label ?? a.status}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {(a.status === 'FILED' || a.status === 'IN_REVIEW') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeciding((v) => (v === a.id ? null : a.id))}
                          >
                            Решение
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {deciding && (
            <div className="border-t border-border p-5">
              <form
                action={(fd) =>
                  run(() =>
                    decideAppeal({
                      appealId: deciding,
                      status: fd.get('status') as 'UPHELD',
                      decision: String(fd.get('decision') ?? '') || undefined,
                      newScore: fd.get('newScore') ? Number(fd.get('newScore')) : undefined,
                    })
                  )
                }
                className="grid gap-3 sm:grid-cols-3"
              >
                <Field label="Решение комиссии" required>
                  <Select name="status" defaultValue="UPHELD" required>
                    <option value="IN_REVIEW">принять к рассмотрению</option>
                    <option value="UPHELD">удовлетворить</option>
                    <option value="REJECTED">отклонить</option>
                  </Select>
                </Field>
                <Field
                  label="Новый итоговый балл"
                  hint="Обязателен при удовлетворении апелляции"
                >
                  <Input name="newScore" type="number" min="0" max="100" step="0.01" />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={pending}>
                    Зафиксировать
                  </Button>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Мотивировка решения">
                    <Textarea name="decision" rows={2} />
                  </Field>
                </div>
              </form>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Выбор обучающегося ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Перезачёт кредитов и проверка на отличие</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Обучающийся" hint="Операции адресные — выберите, по кому работаете">
            <Select
              defaultValue={selectedStudentId ?? ''}
              onChange={(e) =>
                router.push(
                  e.target.value ? `/admin/appeals?student=${e.target.value}` : '/admin/appeals'
                )
              }
            >
              <option value="">— не выбран —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.groupName ? ` · ${s.groupName}` : ''} · {s.programCode}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {selectedStudentId && honours && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Award size={16} className="text-fg-muted" aria-hidden />
              Диплом с отличием
            </CardTitle>
            <Badge tone={honours.eligible ? 'success' : 'neutral'}>
              {honours.eligible ? 'условия выполнены' : 'условия не выполнены'}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-xs text-fg-muted">
              Четыре условия пункта 50 Типовых правил должны выполняться одновременно.
              Переводной балл вуза — {promotionThreshold.toFixed(2)}.
            </p>
            {honours.conditions.map((c) => (
              <div key={c.no} className="flex gap-2 text-sm">
                {c.met ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <XCircle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                )}
                <span>
                  <span className="font-medium">{c.label}</span>
                  <span className="block text-xs text-fg-muted">{c.detail}</span>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {selectedStudentId && transfers && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              Перезачёт кредитов
              <span className="ml-2 text-sm font-normal text-fg-muted">
                утверждено {transfers.totals.creditsApproved} кр, из них в GPA{' '}
                {transfers.totals.creditsInGpa}
              </span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddingTransfer((v) => !v)}>
              <Plus size={14} aria-hidden /> {addingTransfer ? 'Скрыть' : 'Добавить'}
            </Button>
          </CardHeader>

          {addingTransfer && (
            <CardBody className="border-b border-border">
              <form
                action={(fd) =>
                  run(() =>
                    saveCreditTransfer({
                      studentId: selectedStudentId,
                      sourceKind: fd.get('sourceKind') as 'TRANSFER',
                      sourceOrg: String(fd.get('sourceOrg') ?? '') || undefined,
                      sourceDisciplineName: String(fd.get('sourceDisciplineName') ?? ''),
                      credits: Number(fd.get('credits') ?? 0),
                      letter: String(fd.get('letter') ?? '') || undefined,
                      gpaPoint: fd.get('gpaPoint') ? Number(fd.get('gpaPoint')) : undefined,
                      slotId: String(fd.get('slotId') ?? '') || undefined,
                      disciplineId: String(fd.get('disciplineId') ?? '') || undefined,
                      documentRef: String(fd.get('documentRef') ?? '') || undefined,
                    })
                  )
                }
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <Field label="Основание" required>
                  <Select name="sourceKind" defaultValue="TRANSFER" required>
                    {Object.entries(SOURCE_KINDS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Организация образования">
                  <Input name="sourceOrg" placeholder="Наименование вуза" />
                </Field>
                <Field label="Дисциплина в источнике" required>
                  <Input name="sourceDisciplineName" required />
                </Field>
                <Field label="Кредиты" required>
                  <Input name="credits" type="number" step="0.5" min="0.5" max="60" required />
                </Field>
                <Field label="Оценка" hint="Буквенная, если есть в транскрипте">
                  <Input name="letter" maxLength={3} placeholder="B+" />
                </Field>
                <Field label="Цифровой эквивалент" hint="Без него дисциплина в GPA не войдёт">
                  <Input name="gpaPoint" type="number" step="0.01" min="0" max="4" />
                </Field>
                <Field label="Позиция учебного плана">
                  <Select name="slotId" defaultValue="">
                    <option value="">— не сопоставлена —</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Дисциплина программы">
                  <Select name="disciplineId" defaultValue="">
                    <option value="">— не сопоставлена —</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Реквизиты транскрипта"
                    hint="Обязательны для утверждения: перезачёт выполняется по верифицируемому документу"
                  >
                    <Input name="documentRef" placeholder="Транскрипт № … от …" />
                  </Field>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={pending}>
                    Добавить
                  </Button>
                </div>
              </form>
            </CardBody>
          )}

          <CardBody className="p-0">
            {transfers.rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Перезачётов нет"
                  description="Перезачёт выполняется при переводе, восстановлении и после академической мобильности."
                />
              </div>
            ) : (
              <div className="scroll-x">
                <table className="table-dense">
                  <thead>
                    <tr>
                      <th>Дисциплина в источнике</th>
                      <th>Основание</th>
                      <th>Организация</th>
                      <th className="text-right">Кредиты</th>
                      <th>Оценка</th>
                      <th>Сопоставление</th>
                      <th>Документ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-normal font-medium">{r.sourceDisciplineName}</td>
                        <td className="text-xs">{SOURCE_KINDS[r.sourceKind] ?? r.sourceKind}</td>
                        <td className="whitespace-normal text-xs">{r.sourceOrg ?? '—'}</td>
                        <td className="text-right tabular-nums">{r.credits}</td>
                        <td>
                          {r.letter ?? '—'}
                          {r.gpaPoint == null && (
                            <span className="block text-xs text-warning">не в GPA</span>
                          )}
                        </td>
                        <td className="whitespace-normal text-xs">
                          {r.disciplineName ?? r.slotCode ?? '—'}
                        </td>
                        <td className="whitespace-normal text-xs text-fg-muted">
                          {r.documentRef ?? '—'}
                        </td>
                        <td className="text-right">
                          {r.approved ? (
                            <Badge tone="success">утверждён</Badge>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => run(() => approveCreditTransfer(r.id))}
                              >
                                Утвердить
                              </Button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => deleteCreditTransfer(r.id))}
                                className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger"
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
