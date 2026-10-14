'use client';

import { UserPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { assignAuthorAction, removeAuthorAction } from '@/server/dept-actions';

type Opt = { id: string; label: string };

export function AssignAuthorForm({ disciplines, staff, defaultDiscipline, defaultLang }: { disciplines: Opt[]; staff: Opt[]; defaultDiscipline?: string; defaultLang?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await assignAuthorAction(String(fd.get('discipline')), String(fd.get('lang')) as 'ru', String(fd.get('user')));
          if ('error' in res) toast.error(t('common.somethingWrong'));
          else {
            toast.success(t('reports.dept.assigned'));
            router.refresh();
          }
        });
      }}
    >
      <Field label={t('common.discipline')}>
        <Select name="discipline" defaultValue={defaultDiscipline}>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('common.language')}>
        <Select name="lang" defaultValue={defaultLang ?? 'ru'}>
          <option value="kk">{t('common.langKk')}</option>
          <option value="ru">{t('common.langRu')}</option>
          <option value="en">{t('common.langEn')}</option>
        </Select>
      </Field>
      <Field label={t('reports.dept.author')}>
        <Select name="user">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>
        <UserPlus />
        {t('reports.dept.assign')}
      </Button>
    </form>
  );
}

export function RemoveAuthor({ courseId, userId, label }: { courseId: string; userId: string; label: string }) {
  const t = useTranslations('reports.dept');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-sm">
      {label}
      <button
        type="button"
        disabled={pending}
        aria-label={t('removeAuthor')}
        onClick={() => start(async () => (await removeAuthorAction(courseId, userId), router.refresh()))}
        className="rounded-full p-0.5 text-fg-muted hover:text-danger"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
