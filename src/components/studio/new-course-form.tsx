'use client';

import { Archive, Copy, FilePlus2, LayoutTemplate } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createCourseAction } from '@/server/studio-actions';

type Opt = { id: string; label: string };

export function NewCourseForm({ disciplines, templates, myCourses, defaultLanguage }: { disciplines: (Opt & { name: string })[]; templates: Opt[]; myCourses: Opt[]; defaultLanguage: 'kk' | 'ru' | 'en' }) {
  const t = useTranslations('studio.create');
  const tc = useTranslations('common');
  const [from, setFrom] = useState<'empty' | 'template' | 'copy' | 'archive'>('empty');
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id ?? '');
  const [title, setTitle] = useState(disciplines[0]?.name ?? '');
  const [touched, setTouched] = useState(false);
  const [pending, start] = useTransition();
  const ways = [
    { key: 'empty' as const, icon: FilePlus2, title: t('fromEmpty'), hint: t('fromEmptyHint') },
    { key: 'archive' as const, icon: Archive, title: t('fromArchive'), hint: t('fromArchiveHint') },
    ...(templates.length ? [{ key: 'template' as const, icon: LayoutTemplate, title: t('fromTemplate'), hint: t('fromTemplateHint') }] : []),
    ...(myCourses.length ? [{ key: 'copy' as const, icon: Copy, title: t('fromCopy'), hint: t('fromCopyHint') }] : []),
  ];
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(() =>
          createCourseAction({
            title,
            language: String(fd.get('language')) as 'ru',
            disciplineId: disciplineId || null,
            from,
            sourceId: from === 'template' || from === 'copy' ? String(fd.get('sourceId') ?? '') || null : null,
          }),
        );
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('start')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ways.map((w) => (
            <label
              key={w.key}
              className={cn('flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors', from === w.key ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:border-brand/40')}
            >
              <input type="radio" name="from" value={w.key} checked={from === w.key} onChange={() => setFrom(w.key)} className="sr-only" />
              <w.icon className={cn('size-6 shrink-0', from === w.key ? 'text-brand' : 'text-fg-muted')} />
              <span>
                <span className="block font-semibold">{w.title}</span>
                <span className="block text-sm text-fg-muted">{w.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {(from === 'template' || from === 'copy') && (
        <Field label={t('source')}>
          <Select name="sourceId" required>
            {(from === 'template' ? templates : myCourses).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('discipline')}>
          <Select
            value={disciplineId}
            onChange={(e) => {
              setDisciplineId(e.target.value);
              if (!touched) setTitle(disciplines.find((d) => d.id === e.target.value)?.name ?? '');
            }}
          >
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
            <option value="">{t('noDiscipline')}</option>
          </Select>
        </Field>
        <Field label={t('language')} hint={t('languageHint')}>
          <Select name="language" defaultValue={defaultLanguage}>
            <option value="kk">{tc('langKk')}</option>
            <option value="ru">{tc('langRu')}</option>
            <option value="en">{tc('langEn')}</option>
          </Select>
        </Field>
      </div>
      <Field label={t('courseTitle')}>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTouched(true);
          }}
          required
          minLength={2}
          maxLength={200}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
