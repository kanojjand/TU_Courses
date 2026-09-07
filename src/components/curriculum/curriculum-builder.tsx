'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileDown, Plus, ShieldCheck } from 'lucide-react';

import { Link, useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CurriculumStatusBadge } from './status-badge';
import { CompliancePanel } from './compliance-panel';
import { SlotForm, type DisciplineOption } from './slot-form';
import { ModulesPanel } from './modules-panel';
import {
  approveCurriculum,
  archiveCurriculum,
  copyCurriculumVersion,
  deleteSlot,
  rejectCurriculum,
  runValidation,
  submitCurriculum,
} from '@/server/actions/curriculum';
import {
  CONTROL_FORM_LABELS,
  CYCLE_LABELS,
  COMPONENT_LABELS,
  type ComplianceRow,
  type GosoFinding,
  type GosoTotals,
} from '@/domain/goso';

export interface BuilderSlot {
  id: string;
  moduleId: string | null;
  slotCode: string | null;
  cycle: 'OOD' | 'BD' | 'PD' | 'IA' | 'DVO';
  component: 'OK' | 'VK' | 'KV';
  credits: number;
  totalHours: number;
  hoursLecture: number;
  hoursLab: number;
  hoursPractice: number;
  hoursIndividual: number;
  hoursSrs: number;
  hoursSrsp: number;
  hoursPracticeField: number;
  hoursThesis: number;
  controlForm: keyof typeof CONTROL_FORM_LABELS;
  hasCourseWork: boolean;
  terms: number[];
  controlTerm: number | null;
  teachingLang?: string | null;
  chooseN: number;
  isMinorSlot: boolean;
  sortOrder: number;
  /** Позиция закрывает обязательную дисциплину ГОСО — удалять нельзя (R-12) */
  isMandatory: boolean;
  options: {
    disciplineId: string;
    code: string;
    name: string;
    gosoMandatoryName: string | null;
  }[];
}

export interface BuilderCurriculum {
  id: string;
  programCode: string;
  programName: string;
  admissionYear: number;
  version: number;
  studyForm: string;
  status: string;
  termsCount: number;
  profileCode: string;
  profileName: string;
  councilProtocolNo: string | null;
  councilDate: string | null;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
}

export function CurriculumBuilder({
  curriculum,
  modules,
  slots,
  disciplines,
  otherVersions,
  report,
  canEdit,
  canApprove,
}: {
  curriculum: BuilderCurriculum;
  modules: { id: string; code: string | null; nameKk: string; nameRu: string; sortOrder: number }[];
  slots: BuilderSlot[];
  disciplines: DisciplineOption[];
  otherVersions: { id: string; admissionYear: number; version: number; status: string }[];
  report: {
    valid: boolean;
    totals: GosoTotals;
    compliance: ComplianceRow[];
    errors: GosoFinding[];
    warnings: GosoFinding[];
  };
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: 'info' | 'success' | 'danger'; text: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [addingSlot, setAddingSlot] = useState(false);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const locked = curriculum.status === 'APPROVED' || curriculum.status === 'ARCHIVED';
  const editable = canEdit && !locked;

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'danger', text: result.error });
        return;
      }
      router.refresh();
    });
  }

  // Позиции группируются по модулям — так же, как в печатной форме плана.
  // Позиции без модуля показываются последними отдельной группой.
  const groups = [
    ...modules.map((m) => ({
      id: m.id,
      title: m.code ? `${m.code} · ${m.nameRu}` : m.nameRu,
      slots: slots.filter((s) => s.moduleId === m.id),
    })),
    { id: null, title: 'Вне модулей', slots: slots.filter((s) => s.moduleId == null) },
  ].filter((g) => g.slots.length > 0 || g.id != null);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/curricula"
          className="text-sm text-fg-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← Учебные планы
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold">
            {curriculum.programCode} · {curriculum.programName}
          </h1>
          <CurriculumStatusBadge status={curriculum.status} />
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Набор {curriculum.admissionYear}, версия {curriculum.version}, {curriculum.termsCount}{' '}
          семестров · профиль {curriculum.profileName}
          {curriculum.approvedAt && curriculum.approvedBy && (
            <>
              {' · утвердил '}
              {curriculum.approvedBy}
              {curriculum.councilProtocolNo && `, протокол № ${curriculum.councilProtocolNo}`}
            </>
          )}
        </p>
      </div>

      {message && <Alert tone={message.tone === 'info' ? 'info' : message.tone}>{message.text}</Alert>}

      {curriculum.status === 'REJECTED' && curriculum.rejectionReason && (
        <Alert tone="warning" title="План возвращён на доработку">
          {curriculum.rejectionReason}
        </Alert>
      )}

      {locked && canEdit && (
        <Alert tone="info">
          Утверждённый план не редактируется — история регистраций и ИУП должна остаться на нём
          неизменной. Для правок создайте новую версию.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* ── Отчёт валидатора ГОСО (F-CUR-06) ─────────────────────── */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                {report.valid ? (
                  <CheckCircle2 size={16} className="text-success" aria-hidden />
                ) : (
                  <AlertTriangle size={16} className="text-danger" aria-hidden />
                )}
                Валидатор ГОСО
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => runValidation(curriculum.id))}
                >
                  <ShieldCheck size={14} aria-hidden /> Прогнать и сохранить отчёт
                </Button>
                <a
                  href={`/api/export/curriculum?id=${curriculum.id}`}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-semibold text-fg hover:border-brand hover:text-brand"
                >
                  <FileDown size={14} aria-hidden /> Выгрузить .xlsx
                </a>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {report.errors.length === 0 && report.warnings.length === 0 && (
                <p className="text-sm text-success">
                  План соответствует нормативам ГОСО: {report.totals.credits} кредитов,{' '}
                  {report.totals.hours} часов. Замечаний нет.
                </p>
              )}
              {report.errors.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-danger">
                    Блокирующие ошибки ({report.errors.length}) — утверждение невозможно
                  </p>
                  <ul className="space-y-1.5">
                    {report.errors.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <Badge tone="danger" className="shrink-0">
                          {f.rule}
                        </Badge>
                        <span>{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.warnings.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-fg-muted">
                    Предупреждения ({report.warnings.length}) — утверждению не мешают
                  </p>
                  <ul className="space-y-1.5">
                    {report.warnings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-fg-muted">
                        <Badge tone="warning" className="shrink-0">
                          {f.rule}
                        </Badge>
                        <span>{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {/* ── Позиции плана (F-CUR-02) ──────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Позиции плана ({slots.length})</CardTitle>
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingSlot(null);
                    setAddingSlot((v) => !v);
                  }}
                >
                  <Plus size={14} aria-hidden /> {addingSlot ? 'Скрыть' : 'Добавить позицию'}
                </Button>
              )}
            </CardHeader>

            {addingSlot && editable && (
              <CardBody className="border-b border-border">
                <SlotForm
                  curriculumId={curriculum.id}
                  termsCount={curriculum.termsCount}
                  modules={modules}
                  disciplines={disciplines}
                  onDone={() => {
                    setAddingSlot(false);
                    router.refresh();
                  }}
                />
              </CardBody>
            )}

            <CardBody className="space-y-5 p-0 pt-2">
              {slots.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Позиций нет"
                    description="Добавьте позиции плана: цикл, компонент, кредиты, часы по видам работы и семестры изучения."
                  />
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.id ?? 'none'}>
                    <p className="px-5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      {g.title}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {g.slots.reduce((a, s) => a + s.credits, 0)} кр
                      </span>
                    </p>
                    <div className="scroll-x">
                      <table className="table-dense">
                        <thead>
                          <tr>
                            <th>Шифр</th>
                            <th>Дисциплина</th>
                            <th>Цикл</th>
                            <th>Комп.</th>
                            <th className="text-right">Кр</th>
                            <th className="text-right">Ч</th>
                            <th>Семестры</th>
                            <th>Контроль</th>
                            {editable && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {g.slots.map((s) => (
                            <SlotRow
                              key={s.id}
                              slot={s}
                              editable={editable}
                              pending={pending}
                              editing={editingSlot === s.id}
                              onEdit={() => {
                                setAddingSlot(false);
                                setEditingSlot((v) => (v === s.id ? null : s.id));
                              }}
                              onDelete={() => run(() => deleteSlot(curriculum.id, s.id))}
                              form={
                                <SlotForm
                                  curriculumId={curriculum.id}
                                  termsCount={curriculum.termsCount}
                                  modules={modules}
                                  disciplines={disciplines}
                                  slot={s}
                                  onDone={() => {
                                    setEditingSlot(null);
                                    router.refresh();
                                  }}
                                />
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* ── Правая колонка ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <CompliancePanel compliance={report.compliance} totals={report.totals} />

          <Card>
            <CardHeader>
              <CardTitle>Согласование</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {editable && curriculum.status !== 'SUBMITTED' && (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => submitCurriculum(curriculum.id))}
                >
                  Отправить на согласование
                </Button>
              )}

              {canApprove && !locked && (
                <>
                  {!approving ? (
                    <Button
                      className="w-full"
                      disabled={pending || !report.valid}
                      onClick={() => setApproving(true)}
                    >
                      Утвердить план
                    </Button>
                  ) : (
                    <form
                      action={(formData) =>
                        run(async () => {
                          const result = await approveCurriculum({
                            id: curriculum.id,
                            councilProtocolNo: String(formData.get('councilProtocolNo') ?? ''),
                            councilDate: String(formData.get('councilDate') ?? ''),
                          });
                          if (result.ok) setApproving(false);
                          return result;
                        })
                      }
                      className="space-y-2"
                    >
                      <Field label="Протокол Учёного совета №" required>
                        <Input name="councilProtocolNo" required placeholder="12" />
                      </Field>
                      <Field label="Дата протокола" required>
                        <Input name="councilDate" type="date" required />
                      </Field>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={pending}>
                          Утвердить
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setApproving(false)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </form>
                  )}

                  {!report.valid && (
                    <p className="text-xs text-fg-muted">
                      Утверждение станет доступно после устранения блокирующих ошибок валидатора.
                    </p>
                  )}

                  {!rejecting ? (
                    <Button
                      className="w-full"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setRejecting(true)}
                    >
                      Вернуть на доработку
                    </Button>
                  ) : (
                    <form
                      action={(formData) =>
                        run(async () => {
                          const result = await rejectCurriculum({
                            id: curriculum.id,
                            reason: String(formData.get('reason') ?? ''),
                          });
                          if (result.ok) setRejecting(false);
                          return result;
                        })
                      }
                      className="space-y-2"
                    >
                      <Field label="Причина возврата" required>
                        <Textarea name="reason" required minLength={10} rows={3} />
                      </Field>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" variant="danger" disabled={pending}>
                          Вернуть
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRejecting(false)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </form>
                  )}
                </>
              )}

              {canEdit && (
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await copyCurriculumVersion(curriculum.id);
                      if (result.ok && result.data) {
                        router.push(`/admin/curricula/${result.data.id}`);
                      }
                      return result;
                    })
                  }
                >
                  <Copy size={14} aria-hidden /> Создать новую версию
                </Button>
              )}

              {canApprove && curriculum.status === 'APPROVED' && (
                <Button
                  className="w-full"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => archiveCurriculum(curriculum.id))}
                >
                  В архив
                </Button>
              )}
            </CardBody>
          </Card>

          {otherVersions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Другие версии</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1.5">
                {otherVersions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/admin/curricula/${v.id}`}
                      className="text-brand underline-offset-2 hover:underline"
                    >
                      Набор {v.admissionYear}, в. {v.version}
                    </Link>
                    <Link
                      href={`/admin/curricula/${curriculum.id}/compare?with=${v.id}`}
                      className="text-xs text-fg-muted underline-offset-2 hover:text-brand hover:underline"
                    >
                      сравнить
                    </Link>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <ModulesPanel
            curriculumId={curriculum.id}
            modules={modules}
            slotCountByModule={Object.fromEntries(
              modules.map((m) => [m.id, slots.filter((s) => s.moduleId === m.id).length])
            )}
            editable={editable}
          />
        </div>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  editable,
  editing,
  pending,
  onEdit,
  onDelete,
  form,
}: {
  slot: BuilderSlot;
  editable: boolean;
  editing: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  form: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <tr>
        <td className="tabular-nums">{slot.slotCode ?? '—'}</td>
        <td className="whitespace-normal">
          {slot.options.length === 0 ? (
            <span className="text-fg-muted">— дисциплина не выбрана —</span>
          ) : (
            <span>
              {slot.options.map((o) => o.name).join(' / ')}
              {slot.options.length > 1 && (
                <Badge tone="brand" className="ml-2">
                  выбрать {slot.chooseN} из {slot.options.length}
                </Badge>
              )}
              {slot.isMandatory && (
                <Badge tone="success" className="ml-2">
                  ОК ГОСО
                </Badge>
              )}
              {slot.isMinorSlot && (
                <Badge tone="neutral" className="ml-2">
                  минор
                </Badge>
              )}
            </span>
          )}
        </td>
        <td>{CYCLE_LABELS[slot.cycle]}</td>
        <td>{COMPONENT_LABELS[slot.component]}</td>
        <td className="text-right tabular-nums">{slot.credits}</td>
        <td className="text-right tabular-nums">
          <span className={slot.totalHours === slot.credits * 30 ? '' : 'text-warning'}>
            {slot.totalHours}
          </span>
        </td>
        <td className="tabular-nums">{slot.terms.join(', ')}</td>
        <td className="text-xs">
          {CONTROL_FORM_LABELS[slot.controlForm]}
          {slot.controlTerm != null && (
            <span className="text-fg-muted"> · {slot.controlTerm} сем.</span>
          )}
        </td>
        {editable && (
          <td className="text-right">
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-muted hover:text-fg"
              >
                {editing ? 'Свернуть' : 'Правка'}
              </button>
              {!slot.isMandatory &&
                (confirming ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={onDelete}
                    className="rounded bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
                  >
                    Удалить?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger"
                  >
                    Удалить
                  </button>
                ))}
            </div>
          </td>
        )}
      </tr>
      {editing && (
        <tr>
          <td colSpan={editable ? 9 : 8} className="whitespace-normal p-3">
            {form}
          </td>
        </tr>
      )}
    </>
  );
}
