'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { STUDY_FORMS, WINDOW_KINDS } from '@/db/schema';
import { addPeriodAction, addWindowAction, addYearAction, deleteWindowAction } from '@/server/academic-actions';

export function AddYearForm() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          await addYearAction({ title: String(fd.get('title')), startsOn: String(fd.get('startsOn')), endsOn: String(fd.get('endsOn')), isCurrent: fd.get('isCurrent') === 'on' });
          toast.success(t('common.saved'));
          router.refresh();
        });
      }}
    >
      <Field label={t('common.name')}>
        <Input name="title" placeholder="2027–2028" required />
      </Field>
      <Field label={t('reports.academic.startsOn')}>
        <Input name="startsOn" type="date" required />
      </Field>
      <Field label={t('reports.academic.endsOn')}>
        <Input name="endsOn" type="date" required />
      </Field>
      <Checkbox name="isCurrent" label={t('reports.academic.current')} />
      <Button type="submit" disabled={pending}>
        <Plus />
        {t('reports.academic.addYear')}
      </Button>
    </form>
  );
}

export function AddPeriodForm({ years }: { years: { id: string; title: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_6rem_1fr_1fr_1fr_auto_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await addPeriodAction({
            yearId: String(fd.get('yearId')),
            number: Number(fd.get('number')),
            kind: String(fd.get('kind')) as 'semester',
            startsOn: String(fd.get('startsOn')),
            endsOn: String(fd.get('endsOn')),
            isCurrent: fd.get('isCurrent') === 'on',
          });
          if ('error' in res) toast.error(t('common.somethingWrong'));
          else toast.success(`${t('reports.academic.periodCode')}: ${res.code}`);
          router.refresh();
        });
      }}
    >
      <Field label={t('common.period')}>
        <Select name="yearId">
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('reports.academic.number')}>
        <Input name="number" type="number" min={1} max={4} defaultValue={1} />
      </Field>
      <Field label={t('reports.academic.kind')}>
        <Select name="kind">
          <option value="semester">{t('reports.academic.semester')}</option>
          <option value="extra">{t('reports.academic.extra')}</option>
        </Select>
      </Field>
      <Field label={t('reports.academic.startsOn')}>
        <Input name="startsOn" type="date" required />
      </Field>
      <Field label={t('reports.academic.endsOn')}>
        <Input name="endsOn" type="date" required />
      </Field>
      <Checkbox name="isCurrent" label={t('reports.academic.current')} />
      <Button type="submit" disabled={pending || !years.length}>
        <Plus />
        {t('reports.academic.addPeriod')}
      </Button>
    </form>
  );
}

export function AddWindowForm({ periods }: { periods: { id: string; code: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] lg:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await addWindowAction({
            periodId: String(fd.get('periodId')),
            kind: String(fd.get('kind')),
            studyForm: String(fd.get('studyForm') ?? '') || null,
            startsAt: new Date(`${fd.get('startsAt')}T00:00:00+05:00`).toISOString(),
            endsAt: new Date(`${fd.get('endsAt')}T23:59:00+05:00`).toISOString(),
          });
          if ('error' in res) toast.error(t('common.somethingWrong'));
          else toast.success(t('common.saved'));
          router.refresh();
        });
      }}
    >
      <Field label={t('common.period')}>
        <Select name="periodId">
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('reports.academic.kind')}>
        <Select name="kind">
          {WINDOW_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`enums.windowKind.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('reports.academic.studyForm')}>
        <Select name="studyForm">
          <option value="">{t('reports.academic.allForms')}</option>
          {STUDY_FORMS.map((f) => (
            <option key={f} value={f}>
              {t(`enums.studyForm.${f}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('reports.academic.startsOn')}>
        <Input name="startsAt" type="date" required />
      </Field>
      <Field label={t('reports.academic.endsOn')}>
        <Input name="endsAt" type="date" required />
      </Field>
      <Button type="submit" disabled={pending || !periods.length}>
        <Plus />
        {t('reports.academic.addWindow')}
      </Button>
    </form>
  );
}

export function DeleteWindow({ id }: { id: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={t('delete')} onClick={() => window.confirm(t('areYouSure')) && start(async () => (await deleteWindowAction(id), router.refresh()))}>
      <Trash2 />
    </Button>
  );
}
