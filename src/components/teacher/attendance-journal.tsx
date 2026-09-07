'use client';

import { useMemo, useState, useTransition } from 'react';
import { CalendarPlus, Check, Users } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_SHORT,
  LESSON_KIND_LABELS,
  type AttendanceStateCode,
  type StudentAttendance,
} from '@/domain/attendance';
import {
  saveAttendanceSession,
  deleteAttendanceSession,
  saveAttendanceMarks,
} from '@/server/actions/attendance';

export interface JournalSession {
  id: string;
  heldOn: string;
  startsAt: string | null;
  lessonKind: keyof typeof LESSON_KIND_LABELS;
  moduleId: string | null;
  moduleTitle: string | null;
  topic: string | null;
  marks: { studentId: string; state: AttendanceStateCode; reason: string | null }[];
}

const STATE_TONE: Record<AttendanceStateCode, string> = {
  PRESENT: 'bg-success/15 text-success',
  ABSENT: 'bg-danger/15 text-danger',
  LATE: 'bg-warning/15 text-warning',
  EXCUSED: 'bg-brand/12 text-brand',
  ONLINE: 'bg-muted text-fg-muted',
};

const STATES = Object.keys(ATTENDANCE_LABELS) as AttendanceStateCode[];

/**
 * F-LRN-06. Журнал посещаемости.
 *
 * Занятия — столбцы, обучающиеся — строки: так преподаватель видит и
 * заполненность журнала, и картину по каждому студенту. Отметка ставится
 * кликом по ячейке и перебирает состояния по кругу — на потоке в тридцать
 * человек выпадающий список на каждую ячейку неудобен.
 */
export function AttendanceJournal({
  courseId,
  readOnly,
  threshold,
  totals,
  students,
  sessions,
  summary,
  riskIds,
  modules,
}: {
  courseId: string;
  readOnly: boolean;
  threshold: number;
  totals: {
    students: number;
    sessions: number;
    averagePercent: number;
    absences: number;
    excused: number;
    unmarked: number;
  };
  students: { id: string; name: string; groupName: string | null }[];
  sessions: JournalSession[];
  summary: StudentAttendance[];
  riskIds: string[];
  modules: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  // Черновик отметок: правки копятся и сохраняются пакетом по занятию
  const [draft, setDraft] = useState<Record<string, Record<string, AttendanceStateCode>>>({});

  const saved = useMemo(() => {
    const map: Record<string, Record<string, AttendanceStateCode>> = {};
    for (const s of sessions) {
      map[s.id] = Object.fromEntries(s.marks.map((m) => [m.studentId, m.state]));
    }
    return map;
  }, [sessions]);

  const stateOf = (sessionId: string, studentId: string): AttendanceStateCode | null =>
    draft[sessionId]?.[studentId] ?? saved[sessionId]?.[studentId] ?? null;

  const dirty = (sessionId: string) => Object.keys(draft[sessionId] ?? {}).length > 0;

  function cycle(sessionId: string, studentId: string) {
    if (readOnly) return;
    const current = stateOf(sessionId, studentId);
    const next =
      current == null ? 'PRESENT' : STATES[(STATES.indexOf(current) + 1) % STATES.length];
    setDraft((d) => ({ ...d, [sessionId]: { ...(d[sessionId] ?? {}), [studentId]: next } }));
  }

  function markAll(sessionId: string, state: AttendanceStateCode) {
    if (readOnly) return;
    setDraft((d) => ({
      ...d,
      [sessionId]: Object.fromEntries(students.map((s) => [s.id, state])),
    }));
  }

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
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

  function saveSession(sessionId: string) {
    const marks = Object.entries(draft[sessionId] ?? {}).map(([studentId, state]) => ({
      studentId,
      state,
    }));
    if (marks.length === 0) return;
    run(async () => {
      const result = await saveAttendanceMarks({ courseId, sessionId, marks });
      if (result.ok) setDraft((d) => ({ ...d, [sessionId]: {} }));
      return result;
    });
  }

  const summaryById = new Map(summary.map((s) => [s.studentId, s]));
  const risky = new Set(riskIds);

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Занятий проведено" value={String(totals.sessions)} />
        <Stat
          label="Средняя посещаемость"
          value={`${totals.averagePercent} %`}
          tone={totals.averagePercent < threshold ? 'danger' : 'success'}
        />
        <Stat label="Пропусков без причины" value={String(totals.absences)} />
        <Stat
          label="Отметок не проставлено"
          value={String(totals.unmarked)}
          tone={totals.unmarked > 0 ? 'warning' : undefined}
        />
      </div>

      {riskIds.length > 0 && (
        <Alert tone="warning" title={`Посещаемость ниже ${threshold} % — ${riskIds.length}`}>
          {students
            .filter((s) => risky.has(s.id))
            .map((s) => `${s.name} (${summaryById.get(s.id)?.percent ?? 0} %)`)
            .join(', ')}
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Занятия ({sessions.length})</CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <CalendarPlus size={14} aria-hidden /> {adding ? 'Скрыть' : 'Добавить занятие'}
            </Button>
          )}
        </CardHeader>

        {adding && !readOnly && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(async () => {
                  const result = await saveAttendanceSession({
                    courseId,
                    heldOn: String(fd.get('heldOn') ?? ''),
                    startsAt: String(fd.get('startsAt') ?? '') || undefined,
                    lessonKind: fd.get('lessonKind') as 'LECTURE',
                    moduleId: String(fd.get('moduleId') ?? '') || undefined,
                    topic: String(fd.get('topic') ?? '') || undefined,
                  });
                  if (result.ok) setAdding(false);
                  return result;
                })
              }
              className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Field label="Дата" required>
                <Input
                  name="heldOn"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field label="Время" hint="Различает занятия одного дня">
                <Input name="startsAt" type="time" />
              </Field>
              <Field label="Вид занятия" required>
                <Select name="lessonKind" defaultValue="LECTURE" required>
                  {Object.entries(LESSON_KIND_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Раздел курса">
                <Select name="moduleId" defaultValue="">
                  <option value="">— не указан —</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Добавить
                </Button>
              </div>
              <Field label="Тема занятия">
                <Input name="topic" placeholder="Необязательно" />
              </Field>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {students.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="На курс никто не зарегистрирован"
                description="Журнал заполняется по зарегистрированным обучающимся."
              />
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Занятий нет"
                description="Добавьте занятие, чтобы начать вести журнал посещаемости."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-muted">Обучающийся</th>
                    {sessions.map((s) => (
                      <th key={s.id} className="text-center align-bottom">
                        <span className="block whitespace-nowrap">
                          {s.heldOn.slice(8, 10)}.{s.heldOn.slice(5, 7)}
                        </span>
                        <span className="block text-[0.625rem] font-normal normal-case text-fg-muted">
                          {LESSON_KIND_LABELS[s.lessonKind].slice(0, 4)}
                          {s.startsAt && ` ${s.startsAt}`}
                        </span>
                      </th>
                    ))}
                    <th className="text-right">Итог</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const row = summaryById.get(student.id);
                    return (
                      <tr key={student.id}>
                        <td className="sticky left-0 z-10 whitespace-normal bg-surface">
                          <span className={risky.has(student.id) ? 'font-medium text-danger' : ''}>
                            {student.name}
                          </span>
                          {student.groupName && (
                            <span className="block text-xs text-fg-muted">{student.groupName}</span>
                          )}
                        </td>
                        {sessions.map((s) => {
                          const state = stateOf(s.id, student.id);
                          const changed = draft[s.id]?.[student.id] != null;
                          return (
                            <td key={s.id} className="p-0.5 text-center">
                              <button
                                type="button"
                                disabled={readOnly || pending}
                                onClick={() => cycle(s.id, student.id)}
                                aria-label={`${student.name}: ${
                                  state ? ATTENDANCE_LABELS[state] : 'отметка не проставлена'
                                }`}
                                className={`h-7 w-8 rounded text-xs font-semibold transition-colors ${
                                  state
                                    ? STATE_TONE[state]
                                    : 'bg-muted/50 text-fg-muted hover:bg-muted'
                                } ${changed ? 'ring-1 ring-brand' : ''} ${
                                  readOnly ? 'cursor-default' : ''
                                }`}
                              >
                                {state ? ATTENDANCE_SHORT[state] : '·'}
                              </button>
                            </td>
                          );
                        })}
                        <td className="text-right tabular-nums">
                          {row && row.total - row.unmarked > 0 ? (
                            <span className={row.percent < threshold ? 'text-danger' : ''}>
                              {row.percent} %
                            </span>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!readOnly && (
                  <tfoot>
                    <tr>
                      <td className="sticky left-0 z-10 bg-surface text-xs text-fg-muted">
                        Сохранить занятие
                      </td>
                      {sessions.map((s) => (
                        <td key={s.id} className="p-0.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => markAll(s.id, 'PRESENT')}
                              title="Отметить всех присутствующими"
                              className="rounded px-1 text-[0.625rem] text-fg-muted hover:bg-muted hover:text-fg"
                            >
                              все +
                            </button>
                            <button
                              type="button"
                              disabled={pending || !dirty(s.id)}
                              onClick={() => saveSession(s.id)}
                              title="Сохранить отметки занятия"
                              className={`grid h-6 w-8 place-items-center rounded ${
                                dirty(s.id)
                                  ? 'bg-brand text-brand-fg'
                                  : 'bg-muted text-fg-muted opacity-50'
                              }`}
                            >
                              <Check size={12} aria-hidden />
                            </button>
                          </div>
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardBody>

        {sessions.length > 0 && (
          <div className="border-t border-border px-5 py-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
              Обозначения
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              {STATES.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span
                    className={`grid h-5 w-6 place-items-center rounded font-semibold ${STATE_TONE[s]}`}
                  >
                    {ATTENDANCE_SHORT[s]}
                  </span>
                  {ATTENDANCE_LABELS[s]}
                </span>
              ))}
              <span className="text-fg-muted">· — отметка не проставлена</span>
            </div>
          </div>
        )}
      </Card>

      {!readOnly && sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={16} className="text-fg-muted" aria-hidden />
              Удаление занятий
            </CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <Badge key={s.id} className="flex items-center gap-1.5">
                {s.heldOn} · {LESSON_KIND_LABELS[s.lessonKind]}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteAttendanceSession(courseId, s.id))}
                  className="rounded px-1 text-fg-muted hover:text-danger"
                  aria-label={`Удалить занятие ${s.heldOn}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg';
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-fg-muted">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      </CardBody>
    </Card>
  );
}
