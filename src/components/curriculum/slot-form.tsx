'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { saveSlot, type SaveSlotInput } from '@/server/actions/curriculum';
import { CONTROL_FORM_LABELS, CYCLE_LABELS, COMPONENT_LABELS } from '@/domain/goso';
import { HOURS_PER_CREDIT } from '@/domain/constants';
import type { BuilderSlot } from './curriculum-builder';

export interface DisciplineOption {
  id: string;
  code: string;
  name: string;
}

/**
 * F-CUR-02, F-CUR-03. Форма позиции учебного плана.
 *
 * Общий объём часов не вводится: он равен сумме часов по видам работы,
 * и отдельное поле для него означало бы два источника истины. Рядом
 * показывается норматив «кредиты × 30» (R-01), чтобы расхождение было
 * видно сразу, а не только в отчёте валидатора.
 */
export function SlotForm({
  curriculumId,
  termsCount,
  modules,
  disciplines,
  slot,
  onDone,
}: {
  curriculumId: string;
  termsCount: number;
  modules: { id: string; nameRu: string }[];
  disciplines: DisciplineOption[];
  slot?: BuilderSlot;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [credits, setCredits] = useState(slot?.credits ?? 5);
  const [hours, setHours] = useState({
    hoursLecture: slot?.hoursLecture ?? 0,
    hoursLab: slot?.hoursLab ?? 0,
    hoursPractice: slot?.hoursPractice ?? 0,
    hoursIndividual: slot?.hoursIndividual ?? 0,
    hoursSrs: slot?.hoursSrs ?? 0,
    hoursSrsp: slot?.hoursSrsp ?? 0,
    hoursPracticeField: slot?.hoursPracticeField ?? 0,
    hoursThesis: slot?.hoursThesis ?? 0,
  });
  const [terms, setTerms] = useState<number[]>(slot?.terms ?? [1]);
  const [picked, setPicked] = useState<string[]>(
    slot?.options.map((o) => o.disciplineId) ?? []
  );

  const totalHours = useMemo(
    () => Object.values(hours).reduce((a, b) => a + Number(b || 0), 0),
    [hours]
  );
  const requiredHours = Math.round(credits * HOURS_PER_CREDIT);

  function submit(formData: FormData) {
    setError(null);
    if (terms.length === 0) {
      setError('Укажите хотя бы один семестр, в котором читается дисциплина.');
      return;
    }
    startTransition(async () => {
      const input: SaveSlotInput = {
        curriculumId,
        id: slot?.id,
        moduleId: String(formData.get('moduleId') ?? '') || undefined,
        slotCode: String(formData.get('slotCode') ?? '') || undefined,
        cycle: formData.get('cycle') as 'OOD',
        component: formData.get('component') as 'OK',
        credits,
        ...hours,
        controlForm: formData.get('controlForm') as 'EXAM',
        hasCourseWork: formData.get('hasCourseWork') === 'on',
        terms,
        controlTerm: Number(formData.get('controlTerm') ?? 0) || undefined,
        teachingLang: String(formData.get('teachingLang') ?? '') || undefined,
        chooseN: Number(formData.get('chooseN') ?? 1),
        isMinorSlot: formData.get('isMinorSlot') === 'on',
        sortOrder: Number(formData.get('sortOrder') ?? 0),
        disciplineIds: picked,
      };
      const result = await saveSlot(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  const termNumbers = Array.from({ length: termsCount }, (_, i) => i + 1);

  return (
    <form action={submit} className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Шифр позиции" hint="Из печатной формы плана, напр. 1217">
          <Input name="slotCode" defaultValue={slot?.slotCode ?? ''} placeholder="1217" />
        </Field>
        <Field label="Модуль">
          <Select name="moduleId" defaultValue={slot?.moduleId ?? ''}>
            <option value="">— без модуля —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nameRu}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Цикл" required>
          <Select name="cycle" defaultValue={slot?.cycle ?? 'BD'} required>
            {Object.entries(CYCLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Компонент" required>
          <Select name="component" defaultValue={slot?.component ?? 'VK'} required>
            {Object.entries(COMPONENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Кредиты"
          required
          hint={`Норматив по R-01: ${requiredHours} ч`}
        >
          <Input
            name="credits"
            type="number"
            step="0.5"
            min="0.5"
            max="100"
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
            required
          />
        </Field>
        <Field label="Форма контроля" required>
          <Select name="controlForm" defaultValue={slot?.controlForm ?? 'EXAM'} required>
            {Object.entries(CONTROL_FORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Семестр итогового контроля" hint="По умолчанию — последний семестр изучения">
          <Select name="controlTerm" defaultValue={String(slot?.controlTerm ?? '')}>
            <option value="">— автоматически —</option>
            {termNumbers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Язык обучения">
          <Input name="teachingLang" defaultValue={slot?.teachingLang ?? ''} placeholder="K / R / I" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg">
          Семестры изучения <span className="text-danger">*</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {termNumbers.map((t) => {
            const active = terms.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setTerms((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort((a, b) => a - b)
                  )
                }
                className={`h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? 'border-brand bg-brand text-brand-fg'
                    : 'border-border bg-surface text-fg-muted hover:border-brand hover:text-brand'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg">Часы по видам работы</legend>
        <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {(
            [
              ['hoursLecture', 'Лекции'],
              ['hoursPractice', 'Практ.'],
              ['hoursLab', 'Лаб.'],
              ['hoursIndividual', 'Инд.'],
              ['hoursSrs', 'СРС'],
              ['hoursSrsp', 'СРСП'],
              ['hoursPracticeField', 'Практика'],
              ['hoursThesis', 'Диплом'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-fg-muted">{label}</span>
              <Input
                type="number"
                min="0"
                value={hours[key]}
                onChange={(e) => setHours((h) => ({ ...h, [key]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <p
          className={`mt-1.5 text-xs ${totalHours === requiredHours ? 'text-fg-muted' : 'text-warning'}`}
        >
          Всего {totalHours} ч
          {totalHours !== requiredHours &&
            ` — расходится с нормативом ${requiredHours} ч на ${Math.abs(totalHours - requiredHours)} ч (R-01)`}
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg">
          Дисциплины позиции
          <span className="ml-2 text-xs font-normal text-fg-muted">
            для компонента по выбору укажите несколько вариантов (F-CUR-03)
          </span>
        </legend>
        <DisciplinePicker disciplines={disciplines} picked={picked} onChange={setPicked} />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Выбрать дисциплин" hint="R-13: сколько студент изучает из вариантов">
          <Input
            name="chooseN"
            type="number"
            min="1"
            max={Math.max(picked.length, 1)}
            defaultValue={slot?.chooseN ?? 1}
          />
        </Field>
        <Field label="Порядок">
          <Input name="sortOrder" type="number" min="0" defaultValue={slot?.sortOrder ?? 0} />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="hasCourseWork"
            defaultChecked={slot?.hasCourseWork}
            className="h-4 w-4 accent-brand"
          />
          Курсовая работа
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="isMinorSlot"
            defaultChecked={slot?.isMinorSlot}
            className="h-4 w-4 accent-brand"
          />
          Слот минора
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Сохранение…' : slot ? 'Сохранить позицию' : 'Добавить позицию'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

/**
 * Выбор дисциплин позиции. Полный справочник — сотни строк, поэтому
 * список фильтруется поиском, а выбранные показываются отдельно:
 * иначе после прокрутки непонятно, что уже добавлено.
 */
function DisciplinePicker({
  disciplines,
  picked,
  onChange,
}: {
  disciplines: DisciplineOption[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return disciplines
      .filter((d) => !picked.includes(d.id))
      .filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, disciplines, picked]);

  return (
    <div className="space-y-2">
      {picked.length > 0 && (
        <ol className="space-y-1">
          {picked.map((id, i) => {
            const d = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
              >
                <span className="w-5 shrink-0 text-xs text-fg-muted">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">
                  {d ? `${d.code} · ${d.name}` : id}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(picked.filter((x) => x !== id))}
                  className="shrink-0 rounded px-2 py-0.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger"
                >
                  Убрать
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск дисциплины по коду или наименованию"
        aria-label="Поиск дисциплины"
      />
      {matches.length > 0 && (
        <ul className="max-h-52 overflow-y-auto rounded-lg border border-border bg-surface">
          {matches.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...picked, d.id]);
                  setQuery('');
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-soft hover:text-brand"
              >
                <span className="text-xs text-fg-muted">{d.code}</span> · {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
