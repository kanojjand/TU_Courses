'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** F-P-02: фильтры каталога — программа, кафедра, язык, уровень, кредиты, поиск */
export function CatalogFilters({
  programs,
  departments,
  creditOptions,
}: {
  locale: string;
  programs: { id: string; label: string }[];
  departments: { id: string; label: string }[];
  creditOptions: number[];
}) {
  const t = useTranslations('catalog');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <form
      className="space-y-4 lg:sticky lg:top-20 lg:self-start"
      onSubmit={(e) => {
        e.preventDefault();
        update('q', String(new FormData(e.currentTarget).get('q') ?? ''));
      }}
      aria-busy={pending}
    >
      <Field label={tc('search')}>
        <Input name="q" defaultValue={sp.get('q') ?? ''} placeholder={t('searchPlaceholder')} />
      </Field>

      <Field label={t('filterProgram')}>
        <Select value={sp.get('program') ?? ''} onChange={(e) => update('program', e.target.value)}>
          <option value="">{tc('all')}</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </Field>

      <Field label={t('filterDepartment')}>
        <Select value={sp.get('department') ?? ''} onChange={(e) => update('department', e.target.value)}>
          <option value="">{tc('all')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </Select>
      </Field>

      <Field label={t('filterLanguage')}>
        <Select value={sp.get('language') ?? ''} onChange={(e) => update('language', e.target.value)}>
          <option value="">{tc('all')}</option>
          <option value="KK">Қазақша</option>
          <option value="RU">Русский</option>
          <option value="EN">English</option>
        </Select>
      </Field>

      <Field label={t('filterLevel')}>
        <Select value={sp.get('level') ?? ''} onChange={(e) => update('level', e.target.value)}>
          <option value="">{tc('all')}</option>
          <option value="BACHELOR">Бакалавриат</option>
          <option value="MASTER">Магистратура</option>
          <option value="PHD">Докторантура</option>
        </Select>
      </Field>

      <Field label={t('filterCredits')}>
        <Select value={sp.get('credits') ?? ''} onChange={(e) => update('credits', e.target.value)}>
          <option value="">{tc('all')}</option>
          {creditOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1">{tc('filter')}</Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => startTransition(() => router.replace(pathname))}
        >
          {tc('reset')}
        </Button>
      </div>
    </form>
  );
}
