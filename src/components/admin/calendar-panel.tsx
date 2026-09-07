'use client';

import { useState, useTransition } from 'react';
import { CalendarRange, ShieldAlert } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import {
  saveRegistrationWindow,
  deleteRegistrationWindow,
  setPeriodDuration,
  saveCalendarEvent,
  deleteCalendarEvent,
} from '@/server/actions/academic';

export interface PeriodCalendarView {
  id: string;
  name: string;
  yearName: string;
  type: string;
  weeksCount: number | null;
  requiredWeeks: number;
  durationIssue: string | null;
  startDate: string;
  endDate: string;
  windows: {
    kind: string;
    opensAt: string;
    closesAt: string;
    minCredits: number | null;
    maxCredits: number | null;
    isOpen: boolean;
  }[];
  events: {
    id: string;
    kind: string;
    courseNo: number | null;
    startDate: string;
    endDate: string;
    note: string | null;
  }[];
}

const WINDOW_KINDS: Record<string, string> = {
  MAIN: 'Основная регистрация',
  ADD_DROP: 'Добавление и удаление',
  SUMMER: 'Летний семестр',
  RETAKE: 'Повторное изучение',
};

const EVENT_KINDS: Record<string, string> = {
  THEORY: 'теоретическое обучение',
  EXAM_SESSION: 'экзаменационная сессия',
  PRACTICE: 'профессиональная практика',
  VACATION: 'каникулы',
  FINAL_CERT: 'итоговая аттестация',
  SUMMER_TERM: 'летний семестр',
  HOLIDAY: 'праздничные дни',
};

const PERIOD_TYPES: Record<string, string> = {
  SEMESTER: 'семестр',
  TRIMESTER: 'триместр',
  QUARTER: 'квартал',
  SUMMER: 'летний',
};

const asDate = (iso: string) => iso.slice(0, 10);
const asDateTime = (iso: string) => iso.slice(0, 16);

/**
 * F-ACAD-02…F-ACAD-04. Длительность периодов (R-10), окна регистрации
 * и график учебного процесса.
 *
 * Отдельная панель под уже существующим списком периодов: она отвечает
 * за то, когда студент может регистрироваться, а не за сами периоды.
 */
export function CalendarPanel({ periods }: { periods: PeriodCalendarView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(periods[0]?.id ?? null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const violations = periods.filter((p) => p.durationIssue).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Календарь и окна регистрации</h2>
        {violations > 0 && (
          <Badge tone="danger">
            <ShieldAlert size={12} className="mr-1" aria-hidden />
            R-10: нарушений {violations}
          </Badge>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {periods.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <CalendarRange size={16} className="text-fg-muted" aria-hidden />
                {p.yearName} · {p.name}
                <Badge>{PERIOD_TYPES[p.type] ?? p.type}</Badge>
                {p.weeksCount != null && (
                  <Badge tone={p.durationIssue ? 'danger' : 'success'}>
                    {p.weeksCount} нед.
                  </Badge>
                )}
                {p.windows.some((w) => w.isOpen) && <Badge tone="success">регистрация открыта</Badge>}
              </CardTitle>
              {p.durationIssue && (
                <p className="mt-1 text-xs text-danger">{p.durationIssue}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen((v) => (v === p.id ? null : p.id))}
            >
              {open === p.id ? 'Свернуть' : 'Настроить'}
            </Button>
          </CardHeader>

          {open === p.id && (
            <CardBody className="space-y-5">
              {/* ── R-10: длительность ─────────────────────────────────── */}
              <form
                action={(fd) =>
                  run(() =>
                    setPeriodDuration({
                      periodId: p.id,
                      weeksCount: Number(fd.get('weeksCount') ?? 0),
                    })
                  )
                }
                className="flex flex-wrap items-end gap-3"
              >
                <Field
                  label="Длительность, недель"
                  hint={
                    p.requiredWeeks > 0
                      ? `R-10: не менее ${p.requiredWeeks} для этого типа периода`
                      : 'Летний семестр нормативом не ограничен'
                  }
                  required
                >
                  <Input
                    name="weeksCount"
                    type="number"
                    min="1"
                    max="60"
                    defaultValue={p.weeksCount ?? (p.requiredWeeks || 15)}
                    required
                  />
                </Field>
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Сохранить
                </Button>
              </form>

              {/* ── F-ACAD-03: окна регистрации ────────────────────────── */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Окна регистрации</h3>
                <div className="space-y-2">
                  {Object.entries(WINDOW_KINDS).map(([kind, label]) => {
                    const w = p.windows.find((x) => x.kind === kind);
                    return (
                      <form
                        key={kind}
                        action={(fd) =>
                          run(() =>
                            saveRegistrationWindow({
                              periodId: p.id,
                              kind: kind as 'MAIN',
                              opensAt: String(fd.get('opensAt') ?? ''),
                              closesAt: String(fd.get('closesAt') ?? ''),
                              minCredits: fd.get('minCredits')
                                ? Number(fd.get('minCredits'))
                                : undefined,
                              maxCredits: fd.get('maxCredits')
                                ? Number(fd.get('maxCredits'))
                                : undefined,
                            })
                          )
                        }
                        className="grid items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-6"
                      >
                        <div className="sm:col-span-6">
                          <span className="text-sm font-medium">{label}</span>
                          {w?.isOpen && (
                            <Badge tone="success" className="ml-2">
                              открыто
                            </Badge>
                          )}
                        </div>
                        <Field label="Открывается" required>
                          <Input
                            name="opensAt"
                            type="datetime-local"
                            defaultValue={w ? asDateTime(w.opensAt) : ''}
                            required
                          />
                        </Field>
                        <Field label="Закрывается" required>
                          <Input
                            name="closesAt"
                            type="datetime-local"
                            defaultValue={w ? asDateTime(w.closesAt) : ''}
                            required
                          />
                        </Field>
                        <Field label="Мин. кредитов">
                          <Input
                            name="minCredits"
                            type="number"
                            min="0"
                            max="120"
                            defaultValue={w?.minCredits ?? ''}
                          />
                        </Field>
                        <Field label="Макс. кредитов">
                          <Input
                            name="maxCredits"
                            type="number"
                            min="1"
                            max="120"
                            defaultValue={w?.maxCredits ?? ''}
                          />
                        </Field>
                        <div className="flex gap-1 sm:col-span-2">
                          <Button type="submit" size="sm" variant="outline" disabled={pending}>
                            {w ? 'Сохранить' : 'Открыть окно'}
                          </Button>
                          {w && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                run(() => deleteRegistrationWindow(p.id, kind as 'MAIN'))
                              }
                            >
                              Убрать
                            </Button>
                          )}
                        </div>
                      </form>
                    );
                  })}
                </div>
              </div>

              {/* ── F-ACAD-02: график учебного процесса ────────────────── */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">График учебного процесса</h3>
                {p.events.length > 0 && (
                  <div className="scroll-x mb-2">
                    <table className="table-dense">
                      <thead>
                        <tr>
                          <th>Вид</th>
                          <th>Курс</th>
                          <th>Начало</th>
                          <th>Окончание</th>
                          <th>Примечание</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {p.events.map((e) => (
                          <tr key={e.id}>
                            <td>{EVENT_KINDS[e.kind] ?? e.kind}</td>
                            <td className="tabular-nums">{e.courseNo ?? 'все'}</td>
                            <td className="tabular-nums">{asDate(e.startDate)}</td>
                            <td className="tabular-nums">{asDate(e.endDate)}</td>
                            <td className="whitespace-normal text-xs">{e.note ?? '—'}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => deleteCalendarEvent(e.id))}
                                className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger"
                              >
                                Удалить
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <form
                  action={(fd) =>
                    run(() =>
                      saveCalendarEvent({
                        periodId: p.id,
                        kind: fd.get('kind') as 'THEORY',
                        courseNo: fd.get('courseNo') ? Number(fd.get('courseNo')) : undefined,
                        startDate: String(fd.get('startDate') ?? ''),
                        endDate: String(fd.get('endDate') ?? ''),
                        note: String(fd.get('note') ?? '') || undefined,
                      })
                    )
                  }
                  className="grid items-end gap-2 sm:grid-cols-5"
                >
                  <Field label="Вид" required>
                    <Select name="kind" required>
                      {Object.entries(EVENT_KINDS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Курс" hint="Пусто — для всех">
                    <Input name="courseNo" type="number" min="1" max="6" />
                  </Field>
                  <Field label="Начало" required>
                    <Input
                      name="startDate"
                      type="date"
                      defaultValue={asDate(p.startDate)}
                      required
                    />
                  </Field>
                  <Field label="Окончание" required>
                    <Input name="endDate" type="date" defaultValue={asDate(p.endDate)} required />
                  </Field>
                  <div className="flex items-end">
                    <Button type="submit" size="sm" variant="outline" disabled={pending}>
                      Добавить
                    </Button>
                  </div>
                </form>
              </div>
            </CardBody>
          )}
        </Card>
      ))}
    </div>
  );
}
