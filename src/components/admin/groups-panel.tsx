'use client';

import { useState, useTransition } from 'react';
import { Plus, Users } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import { saveGroup, assignAdvisor, transferStudent, changeStudentStatus } from '@/server/actions/groups';

export interface GroupStudentView {
  id: string;
  name: string;
  studyYear: number;
  status: string;
  creditsEarned: number;
  gpa: number | null;
  advisorId: string | null;
  advisorName: string | null;
  iepStatus: string | null;
}

export interface GroupView {
  id: string;
  name: string;
  programId: string;
  programCode: string;
  programName: string;
  studyYear: number;
  admissionYear: number | null;
  language: string;
  studyForm: string;
  curriculumId: string | null;
  curriculumLabel: string | null;
  curatorId: string | null;
  curatorName: string | null;
  students: GroupStudentView[];
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'обучается',
  ACADEMIC_LEAVE: 'академический отпуск',
  EXPELLED: 'отчислен',
  REINSTATED: 'восстановлен',
  GRADUATED: 'выпущен',
  MOBILITY: 'мобильность',
  TRANSFERRED: 'переведён',
};

const REASON_LABELS: Record<string, string> = {
  ACADEMIC_FAILURE: 'академическая неуспеваемость',
  INTEGRITY: 'нарушение академической честности',
  UNPAID: 'неоплата обучения',
  OWN_WILL: 'по собственному желанию',
  HEALTH: 'по состоянию здоровья',
  MILITARY: 'призыв на воинскую службу',
  CHILD: 'отпуск по уходу за ребёнком',
  TRANSFER: 'перевод',
  COMPLETION: 'завершение обучения',
  OTHER: 'иное',
};

const IEP_LABELS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' }> = {
  DRAFT: { label: 'ИУП: черновик', tone: 'neutral' },
  SUBMITTED: { label: 'ИУП: на согласовании', tone: 'brand' },
  APPROVED: { label: 'ИУП: согласован', tone: 'success' },
  REJECTED: { label: 'ИУП: возвращён', tone: 'warning' },
  CONFIRMED: { label: 'ИУП: зафиксирован', tone: 'success' },
};

const STUDY_FORMS: Record<string, string> = {
  FULL_TIME: 'очная',
  PART_TIME: 'заочная',
  DISTANCE: 'дистанционная',
  EVENING: 'вечерняя',
};

export function GroupsPanel({
  groups,
  programs,
  curricula,
  teachers,
}: {
  groups: GroupView[];
  programs: { id: string; code: string; name: string }[];
  curricula: { id: string; programId: string; label: string }[];
  teachers: { id: string; name: string; department: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.id ?? null);
  const [acting, setActing] = useState<{ studentId: string; kind: 'transfer' | 'status' } | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  const [formProgramId, setFormProgramId] = useState(programs[0]?.id ?? '');

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdding(false);
      setEditing(null);
      setActing(null);
      router.refresh();
    });
  }

  function groupForm(group?: GroupView) {
    const programId = group?.programId ?? formProgramId;
    const options = curricula.filter((c) => c.programId === programId);
    return (
      <form
        action={(fd) =>
          run(() =>
            saveGroup({
              id: group?.id,
              programId: String(fd.get('programId') ?? ''),
              name: String(fd.get('name') ?? ''),
              studyYear: Number(fd.get('studyYear') ?? 1),
              admissionYear: fd.get('admissionYear')
                ? Number(fd.get('admissionYear'))
                : undefined,
              language: fd.get('language') as 'KK',
              studyForm: fd.get('studyForm') as 'FULL_TIME',
              curriculumId: String(fd.get('curriculumId') ?? '') || undefined,
              curatorId: String(fd.get('curatorId') ?? '') || undefined,
            })
          )
        }
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Образовательная программа" required>
          <Select
            name="programId"
            defaultValue={programId}
            onChange={(e) => !group && setFormProgramId(e.target.value)}
            required
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Шифр группы" required>
          <Input name="name" defaultValue={group?.name} placeholder="ТАР-25-1к" required />
        </Field>
        <Field label="Курс" required>
          <Input
            name="studyYear"
            type="number"
            min="1"
            max="8"
            defaultValue={group?.studyYear ?? 1}
            required
          />
        </Field>
        <Field label="Год набора">
          <Input
            name="admissionYear"
            type="number"
            min="2000"
            max="2100"
            defaultValue={group?.admissionYear ?? new Date().getFullYear()}
          />
        </Field>
        <Field label="Язык обучения" required>
          <Select name="language" defaultValue={group?.language ?? 'KK'} required>
            <option value="KK">Қазақша</option>
            <option value="RU">Русский</option>
            <option value="EN">English</option>
          </Select>
        </Field>
        <Field label="Форма обучения" required>
          <Select name="studyForm" defaultValue={group?.studyForm ?? 'FULL_TIME'} required>
            {Object.entries(STUDY_FORMS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Учебный план" hint="Определяет, по какому плану студенты формируют ИУП">
          <Select name="curriculumId" defaultValue={group?.curriculumId ?? ''}>
            <option value="">— по программе и году набора —</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Куратор">
          <Select name="curatorId" defaultValue={group?.curatorId ?? ''}>
            <option value="">— не назначен —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.department}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending}>
            {group ? 'Сохранить' : 'Создать группу'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setEditing(null);
            }}
          >
            Отмена
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>Группы ({groups.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} aria-hidden /> {adding ? 'Скрыть' : 'Создать группу'}
          </Button>
        </CardHeader>
        {adding && <CardBody className="border-b border-border">{groupForm()}</CardBody>}
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          title="Групп нет"
          description="Академическая группа связывает обучающихся с программой, годом набора и учебным планом."
        />
      ) : (
        groups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Users size={16} className="text-fg-muted" aria-hidden />
                  {g.name}
                  <Badge>{g.programCode}</Badge>
                  <Badge>{g.studyYear} курс</Badge>
                  <Badge>{g.students.length} чел.</Badge>
                  {g.curriculumLabel && <Badge tone="brand">план: {g.curriculumLabel}</Badge>}
                </CardTitle>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {g.programName} · {STUDY_FORMS[g.studyForm] ?? g.studyForm} ·{' '}
                  {g.curatorName ? `куратор: ${g.curatorName}` : 'куратор не назначен'}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing((v) => (v === g.id ? null : g.id))}
                >
                  Правка
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenGroup((v) => (v === g.id ? null : g.id))}
                >
                  {openGroup === g.id ? 'Свернуть' : 'Состав'}
                </Button>
              </div>
            </CardHeader>

            {editing === g.id && <CardBody className="border-b border-border">{groupForm(g)}</CardBody>}

            {openGroup === g.id && (
              <CardBody className="p-0">
                {g.students.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="В группе нет обучающихся"
                      description="Состав пополняется при зачислении или переводе из другой группы."
                    />
                  </div>
                ) : (
                  <div className="scroll-x">
                    <table className="table-dense">
                      <thead>
                        <tr>
                          <th>ФИО</th>
                          <th>Статус</th>
                          <th>Эдвайзер</th>
                          <th className="text-right">Кредитов</th>
                          <th className="text-right">GPA</th>
                          <th>ИУП</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {g.students.map((s) => (
                          <tr key={s.id}>
                            <td className="whitespace-normal font-medium">{s.name}</td>
                            <td className="text-xs">{STATUS_LABELS[s.status] ?? s.status}</td>
                            <td className="text-xs">
                              <Select
                                aria-label={`Эдвайзер: ${s.name}`}
                                className="h-8 text-xs"
                                defaultValue={s.advisorId ?? ''}
                                disabled={pending}
                                onChange={(e) =>
                                  run(() =>
                                    assignAdvisor({
                                      studentIds: [s.id],
                                      teacherId: e.target.value || undefined,
                                    })
                                  )
                                }
                              >
                                <option value="">— не закреплён —</option>
                                {teachers.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </Select>
                            </td>
                            <td className="text-right tabular-nums">{s.creditsEarned}</td>
                            <td className="text-right tabular-nums">
                              {s.gpa == null ? '—' : s.gpa.toFixed(2)}
                            </td>
                            <td>
                              {s.iepStatus ? (
                                <Badge tone={IEP_LABELS[s.iepStatus]?.tone ?? 'neutral'}>
                                  {IEP_LABELS[s.iepStatus]?.label ?? s.iepStatus}
                                </Badge>
                              ) : (
                                <span className="text-xs text-fg-muted">не сформирован</span>
                              )}
                            </td>
                            <td className="text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActing((v) =>
                                      v?.studentId === s.id && v.kind === 'transfer'
                                        ? null
                                        : { studentId: s.id, kind: 'transfer' }
                                    )
                                  }
                                  className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-muted hover:text-fg"
                                >
                                  Перевести
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActing((v) =>
                                      v?.studentId === s.id && v.kind === 'status'
                                        ? null
                                        : { studentId: s.id, kind: 'status' }
                                    )
                                  }
                                  className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-muted hover:text-fg"
                                >
                                  Статус
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {acting && g.students.some((s) => s.id === acting.studentId) && (
                  <div className="border-t border-border p-4">
                    {acting.kind === 'transfer' ? (
                      <form
                        action={(fd) =>
                          run(() =>
                            transferStudent({
                              studentId: acting.studentId,
                              groupId: String(fd.get('groupId') ?? ''),
                              reason: String(fd.get('reason') ?? '') || undefined,
                            })
                          )
                        }
                        className="grid gap-3 sm:grid-cols-3"
                      >
                        <Field label="Новая группа" required>
                          <Select name="groupId" required>
                            {groups
                              .filter((x) => x.id !== g.id && x.programId === g.programId)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name} · {x.studyYear} курс
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <Field label="Основание">
                          <Input name="reason" placeholder="Приказ № …" />
                        </Field>
                        <div className="flex items-end">
                          <Button type="submit" size="sm" disabled={pending}>
                            Перевести
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <form
                        action={(fd) =>
                          run(() =>
                            changeStudentStatus({
                              studentId: acting.studentId,
                              status: fd.get('status') as 'ACTIVE',
                              reasonCode: (String(fd.get('reasonCode') ?? '') ||
                                undefined) as undefined,
                              reasonText: String(fd.get('reasonText') ?? '') || undefined,
                              orderNo: String(fd.get('orderNo') ?? '') || undefined,
                              orderDate: String(fd.get('orderDate') ?? '') || undefined,
                              startsOn: String(fd.get('startsOn') ?? ''),
                            })
                          )
                        }
                        className="grid gap-3 sm:grid-cols-3"
                      >
                        <Field label="Новый статус" required>
                          <Select name="status" required>
                            {Object.entries(STATUS_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Основание">
                          <Select name="reasonCode">
                            <option value="">— не указано —</option>
                            {Object.entries(REASON_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field
                          label="Приказ №"
                          hint="Обязателен для отчисления, отпуска, восстановления и перевода"
                        >
                          <Input name="orderNo" />
                        </Field>
                        <Field label="Дата приказа">
                          <Input name="orderDate" type="date" />
                        </Field>
                        <Field label="Действует с" required>
                          <Input
                            name="startsOn"
                            type="date"
                            defaultValue={new Date().toISOString().slice(0, 10)}
                            required
                          />
                        </Field>
                        <Field label="Комментарий">
                          <Textarea name="reasonText" rows={2} />
                        </Field>
                        <div className="flex items-end">
                          <Button type="submit" size="sm" disabled={pending}>
                            Изменить статус
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </CardBody>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
