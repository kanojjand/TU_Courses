'use client';

import { useState, useTransition } from 'react';
import { Award, CheckCircle2, GraduationCap, Plus, Users, XCircle } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import type { AdmissionResult } from '@/domain/attestation';
import {
  saveCommittee,
  saveThesis,
  scheduleAttestation,
  recordProtocol,
  issueDiploma,
} from '@/server/actions/attestation';

const THESIS_STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger' }> = {
  ASSIGNED: { label: 'тема закреплена', tone: 'neutral' },
  IN_PROGRESS: { label: 'выполняется', tone: 'brand' },
  SUBMITTED: { label: 'сдана', tone: 'brand' },
  ADMITTED: { label: 'допущена', tone: 'success' },
  DEFENDED: { label: 'защищена', tone: 'success' },
  FAILED: { label: 'не защищена', tone: 'danger' },
};

const FORM_LABELS: Record<string, string> = {
  THESIS_DEFENSE: 'защита дипломной работы',
  COMPLEX_EXAM: 'комплексный экзамен',
};

const ROLE_LABELS: Record<string, string> = {
  CHAIR: 'председатель',
  MEMBER: 'член комиссии',
  SECRETARY: 'секретарь',
  EXTERNAL: 'внешний член',
};

/** F-FIN-01…F-FIN-07. Итоговая аттестация. */
export function AttestationPanel({
  committees,
  theses,
  attestations,
  diplomas,
  students,
  programs,
  years,
  teachers,
  departments,
  selectedStudentId,
  admission,
}: {
  committees: {
    id: string;
    nameRu: string;
    programCode: string;
    yearName: string;
    chairName: string | null;
    orderNo: string | null;
    validFrom: string | null;
    validTo: string | null;
    members: { name: string; role: string }[];
    attestationCount: number;
  }[];
  theses: {
    id: string;
    studentId: string;
    studentName: string;
    groupName: string | null;
    titleRu: string;
    isProject: boolean;
    supervisorName: string | null;
    departmentCode: string | null;
    status: string;
    approvedOrderNo: string | null;
    originalityPct: number | null;
  }[];
  attestations: {
    id: string;
    studentId: string;
    studentName: string;
    groupName: string | null;
    form: string;
    thesisTitle: string | null;
    committeeName: string | null;
    scheduledAt: string | null;
    heldAt: string | null;
    percent: number | null;
    letter: string | null;
    isPassed: boolean | null;
    protocolNo: string | null;
    degreeAwarded: boolean;
  }[];
  diplomas: {
    id: string;
    studentId: string;
    studentName: string;
    programCode: string;
    number: string | null;
    qrCode: string | null;
    issuedOn: string | null;
    withHonours: boolean;
    gpa: number | null;
    supplementNumber: string | null;
  }[];
  students: { id: string; name: string; groupName: string | null; programCode: string }[];
  programs: { id: string; label: string }[];
  years: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
  departments: { id: string; label: string }[];
  selectedStudentId: string | null;
  admission: AdmissionResult | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<'committee' | 'thesis' | 'schedule' | null>(null);
  const [protocolFor, setProtocolFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(null);
      setProtocolFor(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* ── Допуск к аттестации (F-FIN-04) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Допуск к итоговой аттестации</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Обучающийся" hint="Проверка адресная — выберите, по кому работаете">
            <Select
              defaultValue={selectedStudentId ?? ''}
              onChange={(e) =>
                router.push(
                  e.target.value
                    ? `/admin/attestation?student=${e.target.value}`
                    : '/admin/attestation'
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

          {admission && (
            <>
              <Badge tone={admission.admitted ? 'success' : 'danger'}>
                {admission.admitted ? 'допущен к аттестации' : 'к аттестации не допущен'}
              </Badge>
              {admission.conditions.map((c, i) => (
                <div key={i} className="flex gap-2 text-sm">
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
            </>
          )}
        </CardBody>
      </Card>

      {/* ── Комиссии (F-FIN-01) ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users size={16} className="text-fg-muted" aria-hidden />
            Аттестационные комиссии ({committees.length})
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => (v === 'committee' ? null : 'committee'))}
          >
            <Plus size={14} aria-hidden /> Создать
          </Button>
        </CardHeader>

        {open === 'committee' && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(() =>
                  saveCommittee({
                    programId: String(fd.get('programId') ?? ''),
                    academicYearId: String(fd.get('academicYearId') ?? ''),
                    nameRu: String(fd.get('nameRu') ?? ''),
                    chairId: String(fd.get('chairId') ?? '') || undefined,
                    orderNo: String(fd.get('orderNo') ?? '') || undefined,
                    validFrom: String(fd.get('validFrom') ?? '') || undefined,
                    validTo: String(fd.get('validTo') ?? '') || undefined,
                    memberIds: fd.getAll('memberIds').map(String),
                  })
                )
              }
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <Field label="Образовательная программа" required>
                <Select name="programId" required>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Учебный год" required>
                <Select name="academicYearId" required>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Наименование" required>
                <Input name="nameRu" required placeholder="АК по ОП 6В01601" />
              </Field>
              <Field label="Председатель">
                <Select name="chairId" defaultValue="">
                  <option value="">— не назначен —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Приказ №">
                <Input name="orderNo" maxLength={100} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Работает с">
                  <Input name="validFrom" type="date" />
                </Field>
                <Field label="по">
                  <Input name="validTo" type="date" />
                </Field>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Члены комиссии" hint="Удерживайте Ctrl для выбора нескольких">
                  <Select name="memberIds" multiple size={5} className="h-auto">
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Создать
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="space-y-2">
          {committees.length === 0 ? (
            <EmptyState
              title="Комиссий нет"
              description="Аттестационная комиссия создаётся по образовательной программе на учебный год."
            />
          ) : (
            committees.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.nameRu}</span>
                  <Badge>{c.programCode}</Badge>
                  <Badge>{c.yearName}</Badge>
                  {c.orderNo && <Badge>приказ № {c.orderNo}</Badge>}
                  {c.attestationCount > 0 && (
                    <Badge tone="brand">аттестаций {c.attestationCount}</Badge>
                  )}
                </div>
                <p className="text-sm text-fg-muted">
                  {c.chairName ? `Председатель: ${c.chairName}` : 'Председатель не назначен'}
                  {c.validFrom && ` · работает ${c.validFrom}—${c.validTo ?? '…'}`}
                </p>
                {c.members.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.members.map((m, i) => (
                      <Badge key={i} tone={m.role === 'CHAIR' ? 'brand' : 'neutral'}>
                        {m.name} · {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      {/* ── Дипломные работы (F-FIN-02) ─────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap size={16} className="text-fg-muted" aria-hidden />
            Дипломные работы ({theses.length})
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => (v === 'thesis' ? null : 'thesis'))}
          >
            <Plus size={14} aria-hidden /> Закрепить тему
          </Button>
        </CardHeader>

        {open === 'thesis' && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(() =>
                  saveThesis({
                    studentId: String(fd.get('studentId') ?? ''),
                    titleRu: String(fd.get('titleRu') ?? ''),
                    isProject: fd.get('isProject') === 'on',
                    supervisorId: String(fd.get('supervisorId') ?? '') || undefined,
                    departmentId: String(fd.get('departmentId') ?? '') || undefined,
                    approvedOrderNo: String(fd.get('approvedOrderNo') ?? '') || undefined,
                    status: fd.get('status') as 'ASSIGNED',
                  })
                )
              }
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <Field label="Обучающийся" required>
                <Select name="studentId" required>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.groupName ? ` · ${s.groupName}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Тема работы" required>
                  <Input name="titleRu" required minLength={5} maxLength={500} />
                </Field>
              </div>
              <Field label="Научный руководитель">
                <Select name="supervisorId" defaultValue="">
                  <option value="">— не назначен —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Кафедра">
                <Select name="departmentId" defaultValue="">
                  <option value="">— не указана —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Состояние">
                <Select name="status" defaultValue="ASSIGNED">
                  {Object.entries(THESIS_STATUS).map(([v, s]) => (
                    <option key={v} value={v}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Приказ о закреплении">
                <Input name="approvedOrderNo" maxLength={100} />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" name="isProject" className="h-4 w-4 accent-brand" />
                Дипломный проект
              </label>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Закрепить
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {theses.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Тем нет"
                description="Тема дипломной работы закрепляется за обучающимся приказом, с научным руководителем."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Обучающийся</th>
                    <th>Тема</th>
                    <th>Руководитель</th>
                    <th>Приказ</th>
                    <th className="text-right">Оригинальность</th>
                    <th>Состояние</th>
                  </tr>
                </thead>
                <tbody>
                  {theses.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{t.studentName}</span>
                        {t.groupName && (
                          <span className="block text-xs text-fg-muted">{t.groupName}</span>
                        )}
                      </td>
                      <td className="whitespace-normal">
                        {t.titleRu}
                        {t.isProject && <Badge className="ml-2">проект</Badge>}
                      </td>
                      <td className="whitespace-normal text-xs">{t.supervisorName ?? '—'}</td>
                      <td className="text-xs">{t.approvedOrderNo ?? '—'}</td>
                      <td className="text-right tabular-nums">
                        {t.originalityPct == null ? '—' : `${t.originalityPct} %`}
                      </td>
                      <td>
                        <Badge tone={THESIS_STATUS[t.status]?.tone ?? 'neutral'}>
                          {THESIS_STATUS[t.status]?.label ?? t.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Аттестации и протоколы (F-FIN-03, F-FIN-05, F-FIN-06) ──── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Аттестации ({attestations.length})</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => (v === 'schedule' ? null : 'schedule'))}
          >
            <Plus size={14} aria-hidden /> Назначить
          </Button>
        </CardHeader>

        {open === 'schedule' && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(() =>
                  scheduleAttestation({
                    studentId: String(fd.get('studentId') ?? ''),
                    committeeId: String(fd.get('committeeId') ?? ''),
                    form: fd.get('form') as 'THESIS_DEFENSE',
                    thesisId: String(fd.get('thesisId') ?? '') || undefined,
                    scheduledAt: String(fd.get('scheduledAt') ?? ''),
                  })
                )
              }
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <Field label="Обучающийся" required>
                <Select name="studentId" required defaultValue={selectedStudentId ?? ''}>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.groupName ? ` · ${s.groupName}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Комиссия" required>
                <Select name="committeeId" required>
                  {committees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameRu} · {c.yearName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Форма аттестации" required>
                <Select name="form" defaultValue="THESIS_DEFENSE" required>
                  {Object.entries(FORM_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Дипломная работа">
                <Select name="thesisId" defaultValue="">
                  <option value="">— не указана —</option>
                  {theses.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.studentName} · {t.titleRu.slice(0, 60)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Дата и время" required>
                <Input name="scheduledAt" type="datetime-local" required />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Назначить
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {attestations.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Аттестаций нет"
                description="Назначьте итоговую аттестацию допущенному обучающемуся."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Обучающийся</th>
                    <th>Форма</th>
                    <th>Комиссия</th>
                    <th>Назначена</th>
                    <th>Результат</th>
                    <th>Протокол</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attestations.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{a.studentName}</span>
                        {a.groupName && (
                          <span className="block text-xs text-fg-muted">{a.groupName}</span>
                        )}
                      </td>
                      <td className="whitespace-normal text-xs">
                        {FORM_LABELS[a.form] ?? a.form}
                        {a.thesisTitle && (
                          <span className="block text-fg-muted">{a.thesisTitle}</span>
                        )}
                      </td>
                      <td className="whitespace-normal text-xs">{a.committeeName ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs tabular-nums">
                        {a.scheduledAt?.replace('T', ' ') ?? '—'}
                      </td>
                      <td>
                        {a.letter ? (
                          <Badge tone={a.isPassed ? 'success' : 'danger'}>
                            {a.letter} · {a.percent}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">не проводилась</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {a.protocolNo ?? '—'}
                        {a.degreeAwarded && (
                          <Badge tone="success" className="ml-1">
                            степень присуждена
                          </Badge>
                        )}
                      </td>
                      <td className="text-right">
                        {!a.heldAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setProtocolFor((v) => (v === a.studentId ? null : a.studentId))}
                          >
                            Протокол
                          </Button>
                        )}
                        {a.isPassed && a.degreeAwarded && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => run(() => issueDiploma({ studentId: a.studentId }))}
                          >
                            Диплом
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {protocolFor && (
            <div className="border-t border-border p-5">
              <form
                action={(fd) =>
                  run(() =>
                    recordProtocol({
                      studentId: protocolFor,
                      percent: Number(fd.get('percent') ?? 0),
                      protocolNo: String(fd.get('protocolNo') ?? ''),
                      degreeAwarded: fd.get('degreeAwarded') === 'on',
                    })
                  )
                }
                className="grid gap-3 sm:grid-cols-4"
              >
                <Field label="Итоговый балл" required>
                  <Input name="percent" type="number" min="0" max="100" step="0.01" required />
                </Field>
                <Field label="Протокол №" required>
                  <Input name="protocolNo" required maxLength={100} />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" name="degreeAwarded" className="h-4 w-4 accent-brand" />
                  Присудить степень
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={pending}>
                    Внести протокол
                  </Button>
                </div>
                <p className="text-xs text-fg-muted sm:col-span-4">
                  Оценка вносится один раз: повторная сдача для повышения не допускается.
                  При неудовлетворительной оценке степень не присуждается и обучающийся
                  отчисляется.
                </p>
              </form>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Дипломы (F-FIN-07) ──────────────────────────────────────── */}
      {diplomas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award size={16} className="text-fg-muted" aria-hidden />
              Дипломы ({diplomas.length})
            </CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Обучающийся</th>
                    <th>Программа</th>
                    <th>Номер</th>
                    <th>QR-код</th>
                    <th>Выдан</th>
                    <th className="text-right">GPA</th>
                    <th>Приложение</th>
                  </tr>
                </thead>
                <tbody>
                  {diplomas.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{d.studentName}</span>
                        {d.withHonours && (
                          <Badge tone="success" className="ml-2">
                            с отличием
                          </Badge>
                        )}
                      </td>
                      <td className="text-xs">{d.programCode}</td>
                      <td className="text-xs">{d.number ?? '—'}</td>
                      <td className="text-xs">{d.qrCode ?? 'ожидается из ИС'}</td>
                      <td className="text-xs tabular-nums">{d.issuedOn ?? '—'}</td>
                      <td className="text-right tabular-nums">{d.gpa?.toFixed(2) ?? '—'}</td>
                      <td className="text-xs">{d.supplementNumber ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
