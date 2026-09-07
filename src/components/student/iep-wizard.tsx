'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Info, Printer, Send } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { CYCLE_LABELS, COMPONENT_LABELS } from '@/domain/goso';
import {
  saveIepSelections,
  submitIep,
  registerForCourse,
  dropRegistration,
} from '@/server/actions/iep';

export interface IepOfferView {
  slotId: string;
  slotCode: string | null;
  cycle: keyof typeof CYCLE_LABELS;
  component: keyof typeof COMPONENT_LABELS;
  credits: number;
  terms: number[];
  controlTerm: number | null;
  chooseN: number;
  isMinorSlot: boolean;
  isAutomatic: boolean;
  options: {
    disciplineId: string;
    code: string;
    name: string;
    available: boolean;
    blockedReason: string | null;
    completed: boolean;
    needsRetake: boolean;
  }[];
}

export interface IepItemView {
  id: string;
  disciplineId: string;
  disciplineCode: string;
  disciplineName: string;
  termNo: number;
  credits: number;
  isRetake: boolean;
  registrations: {
    id: string;
    status: string;
    attemptNo: number;
    waitlistPos: number | null;
    courseId: string;
    periodName: string;
  }[];
}

export interface OfferingView {
  id: string;
  disciplineId: string;
  streamName: string | null;
  periodName: string;
  capacity: number | null;
  registered: number;
  language: string;
  /** Совпадает ли язык потока с языком обучения студента (F-IEP-05) */
  matchesLanguage: boolean;
  teacher: string | null;
}

const LANGUAGE_LABELS: Record<string, string> = {
  KK: 'қазақша',
  RU: 'на русском',
  EN: 'in English',
};

const STATUS_VIEW: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' }> = {
  DRAFT: { label: 'черновик', tone: 'neutral' },
  SUBMITTED: { label: 'на согласовании у эдвайзера', tone: 'brand' },
  APPROVED: { label: 'согласован эдвайзером', tone: 'success' },
  REJECTED: { label: 'возвращён на доработку', tone: 'warning' },
  CONFIRMED: { label: 'зафиксирован офисом Регистратора', tone: 'success' },
};

const REG_STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  REGISTERED: { label: 'зарегистрирован', tone: 'success' },
  WAITLISTED: { label: 'лист ожидания', tone: 'warning' },
  PENDING: { label: 'ожидает', tone: 'neutral' },
  DROPPED: { label: 'снят', tone: 'neutral' },
  COMPLETED: { label: 'освоена', tone: 'success' },
  FAILED: { label: 'не освоена', tone: 'danger' },
  RETAKE: { label: 'повторное изучение', tone: 'warning' },
};

const WINDOW_LABELS: Record<string, string> = {
  MAIN: 'основная регистрация',
  ADD_DROP: 'добавление и удаление',
  SUMMER: 'летний семестр',
  RETAKE: 'повторное изучение',
};

export function IepWizard({
  academicYearId,
  academicYearName,
  student,
  curriculum,
  terms,
  limits,
  status,
  advisorComment,
  offers,
  initialSelections,
  items,
  offerings,
  windows,
}: {
  academicYearId: string;
  academicYearName: string;
  student: {
    studyYear: number;
    programCode: string;
    programName: string;
    groupName: string | null;
    advisorName: string | null;
  };
  curriculum: { admissionYear: number; version: number };
  terms: number[];
  limits: { normCredits: number; minCredits: number | null; maxCredits: number | null };
  status: string | null;
  advisorComment: string | null;
  offers: IepOfferView[];
  initialSelections: { slotId: string; disciplineId: string }[];
  items: IepItemView[];
  offerings: OfferingView[];
  windows: { kind: string; opensAt: string; closesAt: string; isOpen: boolean }[];
}) {
  const router = useRouter();
  const [selections, setSelections] = useState(initialSelections);
  const [message, setMessage] = useState<{ tone: 'info' | 'success' | 'danger'; text: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  const editable = status == null || status === 'DRAFT' || status === 'REJECTED';
  const canRegister = status === 'APPROVED' || status === 'CONFIRMED';

  // F-IEP-02: счётчик кредитов в реальном времени
  const chosenSlotIds = useMemo(() => new Set(selections.map((s) => s.slotId)), [selections]);
  const credits = useMemo(
    () =>
      Math.round(
        offers
          .filter((o) => o.isAutomatic || chosenSlotIds.has(o.slotId))
          .reduce((a, o) => a + o.credits, 0) * 100
      ) / 100,
    [offers, chosenSlotIds]
  );

  const remaining = offers.filter(
    (o) => !o.isAutomatic && selections.filter((s) => s.slotId === o.slotId).length < o.chooseN
  );

  const overMax = limits.maxCredits != null && credits > limits.maxCredits;
  const underMin = limits.minCredits != null && credits < limits.minCredits;
  const readyToSubmit = remaining.length === 0 && !overMax && !underMin;

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

  function pick(slotId: string, disciplineId: string, chooseN: number) {
    setSelections((prev) => {
      const others = prev.filter((s) => s.slotId !== slotId);
      const same = prev.filter((s) => s.slotId === slotId);
      const already = same.some((s) => s.disciplineId === disciplineId);
      if (already) return [...others, ...same.filter((s) => s.disciplineId !== disciplineId)];
      // Из позиции выбирается ровно chooseN: при переполнении вытесняется
      // самый ранний выбор, а не блокируется клик
      const kept = same.length >= chooseN ? same.slice(same.length - chooseN + 1) : same;
      return [...others, ...kept, { slotId, disciplineId }];
    });
  }

  const grouped = [
    { title: 'Обязательные дисциплины', list: offers.filter((o) => o.isAutomatic) },
    { title: 'Дисциплины по выбору', list: offers.filter((o) => !o.isAutomatic) },
  ].filter((g) => g.list.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold sm:text-3xl">Индивидуальный учебный план</h1>
          {status && (
            <Badge tone={STATUS_VIEW[status]?.tone ?? 'neutral'}>
              {STATUS_VIEW[status]?.label ?? status}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {academicYearName} · {student.studyYear} курс · {student.programCode}{' '}
          {student.programName}
          {student.groupName && ` · группа ${student.groupName}`} · план набора{' '}
          {curriculum.admissionYear}, версия {curriculum.version} · семестры {terms.join(' и ')}
        </p>
      </div>

      {message && <Alert tone={message.tone === 'info' ? 'info' : message.tone} className="mb-4">{message.text}</Alert>}

      {status === 'REJECTED' && advisorComment && (
        <Alert tone="warning" title="Эдвайзер вернул ИУП на доработку" className="mb-4">
          {advisorComment}
        </Alert>
      )}

      {status === 'SUBMITTED' && (
        <Alert tone="info" className="mb-4">
          ИУП отправлен на согласование
          {student.advisorName ? ` эдвайзеру: ${student.advisorName}` : ''}. Изменения станут
          возможны, если он вернёт план на доработку.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          {grouped.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle>
                  {group.title}
                  <span className="ml-2 text-sm font-normal text-fg-muted">
                    {group.list.length} · {group.list.reduce((a, o) => a + o.credits, 0)} кр
                  </span>
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                {group.list.map((offer) => {
                  const picked = selections.filter((s) => s.slotId === offer.slotId);
                  const done = offer.isAutomatic || picked.length >= offer.chooseN;
                  return (
                    <div
                      key={offer.slotId}
                      className={`rounded-lg border p-3 ${
                        done ? 'border-border' : 'border-warning/50 bg-warning/5'
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        {offer.slotCode && (
                          <span className="font-mono text-fg-muted">{offer.slotCode}</span>
                        )}
                        <Badge>{CYCLE_LABELS[offer.cycle]}</Badge>
                        <Badge>{COMPONENT_LABELS[offer.component]}</Badge>
                        <Badge>{offer.credits} кр</Badge>
                        <Badge>
                          {offer.terms.length > 1 ? 'семестры' : 'семестр'} {offer.terms.join(', ')}
                        </Badge>
                        {offer.isMinorSlot && <Badge tone="brand">минор</Badge>}
                        {!offer.isAutomatic && (
                          <Badge tone={done ? 'success' : 'warning'}>
                            выбрать {offer.chooseN} из {offer.options.length}
                          </Badge>
                        )}
                      </div>

                      {offer.isAutomatic ? (
                        <p className="text-sm">
                          {offer.options[0]?.name ?? '—'}
                          <span className="ml-2 text-xs text-fg-muted">
                            {offer.options[0]?.code}
                          </span>
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {offer.options.map((o) => {
                            const active = picked.some((s) => s.disciplineId === o.disciplineId);
                            return (
                              <li key={o.disciplineId}>
                                <button
                                  type="button"
                                  disabled={!editable || (!o.available && !active)}
                                  onClick={() => pick(offer.slotId, o.disciplineId, offer.chooseN)}
                                  className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                    active
                                      ? 'border-brand bg-brand-soft'
                                      : o.available
                                        ? 'border-border hover:border-brand'
                                        : 'cursor-not-allowed border-border opacity-55'
                                  }`}
                                >
                                  <span
                                    aria-hidden
                                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                                      active ? 'border-brand bg-brand' : 'border-border'
                                    }`}
                                  >
                                    {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-fg" />}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block">{o.name}</span>
                                    <span className="block text-xs text-fg-muted">{o.code}</span>
                                    {/* F-IEP-03: причина недоступности видна сразу */}
                                    {o.blockedReason && (
                                      <span className="mt-0.5 block text-xs text-warning">
                                        {o.blockedReason}
                                      </span>
                                    )}
                                    {o.needsRetake && (
                                      <span className="mt-0.5 block text-xs text-danger">
                                        Требуется повторное изучение после оценки F
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          ))}

          {/* ── Регистрация на реализации дисциплин (F-IEP-05…07) ─────── */}
          {canRegister && items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Регистрация на дисциплины</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                {items.map((item) => {
                  const active = item.registrations.find(
                    (r) => r.status !== 'DROPPED'
                  );
                  const choices = offerings.filter((o) => o.disciplineId === item.disciplineId);
                  return (
                    <div key={item.id} className="rounded-lg border border-border p-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{item.disciplineName}</span>
                        <span className="font-mono text-xs text-fg-muted">
                          {item.disciplineCode}
                        </span>
                        <Badge>{item.credits} кр</Badge>
                        {item.isRetake && <Badge tone="warning">повторное изучение</Badge>}
                        {active && (
                          <Badge tone={REG_STATUS[active.status]?.tone ?? 'neutral'}>
                            {REG_STATUS[active.status]?.label ?? active.status}
                            {active.waitlistPos != null && ` · ${active.waitlistPos}-й`}
                          </Badge>
                        )}
                      </div>

                      {active ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                          <span>{active.periodName}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => run(() => dropRegistration(active.id))}
                          >
                            Снять регистрацию
                          </Button>
                        </div>
                      ) : choices.length === 0 ? (
                        <p className="text-sm text-fg-muted">
                          Реализация дисциплины в этом учебном году ещё не открыта.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {choices.map((c) => {
                            const full = c.capacity != null && c.registered >= c.capacity;
                            return (
                              <Button
                                key={c.id}
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    registerForCourse({ iepItemId: item.id, courseId: c.id })
                                  )
                                }
                              >
                                {c.periodName}
                                {c.streamName && ` · ${c.streamName}`}
                                {c.teacher && ` · ${c.teacher}`}
                                {!c.matchesLanguage && (
                                  <span className="text-warning">
                                    · {LANGUAGE_LABELS[c.language] ?? c.language}
                                  </span>
                                )}
                                {c.capacity != null && (
                                  <span className={full ? 'text-warning' : 'text-fg-muted'}>
                                    {c.registered}/{c.capacity}
                                    {full && ' — в лист ожидания'}
                                  </span>
                                )}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}
        </div>

        {/* ── Счётчик кредитов и действия ──────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Кредиты за год</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  <span className={overMax || underMin ? 'text-danger' : 'text-fg'}>{credits}</span>
                  <span className="text-lg font-normal text-fg-muted"> / {limits.normCredits}</span>
                </p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      overMax || underMin ? 'bg-danger' : 'bg-success'
                    }`}
                    style={{
                      width: `${Math.min(100, (credits / Math.max(limits.normCredits, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-fg-muted">
                  Рекомендуемая норма — {limits.normCredits} кредитов в год
                  {limits.minCredits != null && `, минимум ${limits.minCredits}`}
                  {limits.maxCredits != null && `, максимум ${limits.maxCredits}`}.
                </p>
              </div>

              {remaining.length > 0 && (
                <p className="flex gap-1.5 text-sm text-warning">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                  Осталось сделать выбор по {remaining.length}{' '}
                  {remaining.length === 1 ? 'позиции' : 'позициям'}.
                </p>
              )}
              {overMax && (
                <p className="text-sm text-danger">
                  Превышен максимум в {limits.maxCredits} кредитов.
                </p>
              )}
              {underMin && (
                <p className="text-sm text-danger">
                  Не набран минимум в {limits.minCredits} кредитов.
                </p>
              )}
              {readyToSubmit && editable && (
                <p className="flex gap-1.5 text-sm text-success">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                  Выбор сделан полностью — ИУП можно отправить эдвайзеру.
                </p>
              )}

              {editable && (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() => saveIepSelections({ academicYearId, selections }))
                    }
                  >
                    Сохранить черновик
                  </Button>
                  <Button
                    className="w-full"
                    disabled={pending || !readyToSubmit}
                    onClick={() =>
                      run(async () => {
                        const saved = await saveIepSelections({ academicYearId, selections });
                        if (!saved.ok) return saved;
                        return submitIep(academicYearId);
                      })
                    }
                  >
                    <Send size={14} aria-hidden /> Отправить эдвайзеру
                  </Button>
                </div>
              )}

              {/* F-IEP-08: печать ИУП. Браузерная печать даёт и PDF —
                  отдельный генератор для этого не нужен */}
              <Button
                className="w-full no-print"
                variant="ghost"
                onClick={() => window.print()}
              >
                <Printer size={14} aria-hidden /> Печать ИУП
              </Button>
            </CardBody>
          </Card>

          {windows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Окна регистрации</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {windows.map((w) => (
                  <div key={w.kind} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{WINDOW_LABELS[w.kind] ?? w.kind}</span>
                      <Badge tone={w.isOpen ? 'success' : 'neutral'}>
                        {w.isOpen ? 'открыто' : 'закрыто'}
                      </Badge>
                    </div>
                    <p className="text-xs text-fg-muted">
                      {new Date(w.opensAt).toLocaleDateString('ru-RU')} —{' '}
                      {new Date(w.closesAt).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Alert tone="info">
            <span className="flex gap-1.5">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span className="text-sm">
                Обязательные дисциплины подставлены автоматически. Выбрать нужно только
                дисциплины компонента по выбору. После согласования эдвайзером откроется
                регистрация на реализации дисциплин.
              </span>
            </span>
          </Alert>
        </div>
      </div>
    </div>
  );
}
