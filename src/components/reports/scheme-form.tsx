'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { saveSchemeAction } from '@/server/academic-actions';

export type SchemeValues = {
  title: string;
  currentWeight: number;
  admissionThreshold: number;
  rkMinScore: number;
  lateRule: 'none' | 'penalty' | 'zero';
  latePenaltyPct: number;
  videoThreshold: number;
  rk1Week: number;
  rk2Week: number;
  isDefault: boolean;
};

export function SchemeForm({ id, initial }: { id: string | null; initial: SchemeValues }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const n = (k: string) => Number(String(fd.get(k) ?? '0').replace(',', '.'));
        start(async () => {
          try {
            await saveSchemeAction(id, {
              title: String(fd.get('title')),
              currentWeight: n('currentWeight'),
              admissionThreshold: n('admissionThreshold'),
              rkMinScore: n('rkMinScore'),
              lateRule: String(fd.get('lateRule')) as 'penalty',
              latePenaltyPct: n('latePenaltyPct'),
              videoThreshold: n('videoThreshold'),
              rk1Week: n('rk1Week'),
              rk2Week: n('rk2Week'),
              isDefault: fd.get('isDefault') === 'on',
            });
            toast.success(t('common.saved'));
            router.refresh();
          } catch {
            toast.error(t('common.somethingWrong'));
          }
        });
      }}
    >
      <Field label={t('common.name')}>
        <Input name="title" defaultValue={initial.title} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('reports.academic.currentWeight')}>
          <Input name="currentWeight" inputMode="decimal" defaultValue={initial.currentWeight} />
        </Field>
        <Field label={t('reports.academic.admissionThreshold')}>
          <Input name="admissionThreshold" type="number" min={0} max={100} defaultValue={initial.admissionThreshold} />
        </Field>
        <Field label={t('reports.academic.rkMinScore')}>
          <Input name="rkMinScore" type="number" min={0} max={100} defaultValue={initial.rkMinScore} />
        </Field>
        <Field label={t('reports.academic.lateRule')}>
          <Select name="lateRule" defaultValue={initial.lateRule}>
            <option value="none">{t('enums.lateRule.none')}</option>
            <option value="penalty">{t('enums.lateRule.penalty')}</option>
            <option value="zero">{t('enums.lateRule.zero')}</option>
          </Select>
        </Field>
        <Field label={t('reports.academic.latePenalty')}>
          <Input name="latePenaltyPct" type="number" min={0} max={100} defaultValue={initial.latePenaltyPct} />
        </Field>
        <Field label={t('reports.academic.videoThreshold')}>
          <Input name="videoThreshold" type="number" min={1} max={100} defaultValue={initial.videoThreshold} />
        </Field>
        <Field label={t('reports.academic.rk1Week')}>
          <Input name="rk1Week" type="number" min={1} max={30} defaultValue={initial.rk1Week} />
        </Field>
        <Field label={t('reports.academic.rk2Week')}>
          <Input name="rk2Week" type="number" min={1} max={30} defaultValue={initial.rk2Week} />
        </Field>
      </div>
      <Checkbox name="isDefault" defaultChecked={initial.isDefault} label={t('reports.academic.isDefault')} />
      <Button type="submit" disabled={pending}>
        {t('common.save')}
      </Button>
    </form>
  );
}
