'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { copyCourseAction, updateCourseAction } from '@/server/studio-actions';

type Opt = { id: string; label: string };

export function CourseSettings({
  courseId,
  initial,
  disciplines,
}: {
  courseId: string;
  initial: { title: string; description: string | null; language: 'kk' | 'ru' | 'en'; disciplineId: string | null };
  disciplines: Opt[];
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [copying, setCopying] = useState(false);
  const langs = (
    <>
      <option value="kk">{t('common.langKk')}</option>
      <option value="ru">{t('common.langRu')}</option>
      <option value="en">{t('common.langEn')}</option>
    </>
  );
  const discOptions = (
    <>
      <option value="">{t('studio.create.noDiscipline')}</option>
      {disciplines.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
    </>
  );
  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            await updateCourseAction(courseId, {
              title: String(fd.get('title')),
              description: String(fd.get('description') ?? '') || null,
              language: String(fd.get('language')) as 'ru',
              disciplineId: String(fd.get('disciplineId') ?? '') || null,
            });
            toast.success(t('common.saved'));
          });
        }}
      >
        <Field label={t('studio.create.courseTitle')}>
          <Input name="title" defaultValue={initial.title} required minLength={2} maxLength={200} />
        </Field>
        <Field label={t('studio.settings.description')}>
          <Textarea name="description" defaultValue={initial.description ?? ''} rows={4} maxLength={4000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('studio.create.discipline')}>
            <Select name="disciplineId" defaultValue={initial.disciplineId ?? ''}>
              {discOptions}
            </Select>
          </Field>
          <Field label={t('studio.create.language')} hint={t('studio.create.languageHint')}>
            <Select name="language" defaultValue={initial.language}>
              {langs}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
      </form>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-1 font-semibold">{t('studio.copy.title')}</p>
        <p className="mb-3 text-sm text-fg-muted">{t('studio.copy.hint')}</p>
        <Button variant="secondary" onClick={() => setCopying(true)}>
          <Copy />
          {t('studio.builder.copy')}
        </Button>
      </div>

      <Dialog open={copying} onOpenChange={setCopying}>
        <DialogContent title={t('studio.copy.title')} description={t('studio.copy.hint')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(() =>
                copyCourseAction(courseId, {
                  title: String(fd.get('title')),
                  language: String(fd.get('language')) as 'ru',
                  disciplineId: String(fd.get('disciplineId') ?? '') || null,
                }),
              );
            }}
          >
            <Field label={t('studio.create.courseTitle')}>
              <Input name="title" defaultValue={initial.title} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('studio.create.discipline')}>
                <Select name="disciplineId" defaultValue={initial.disciplineId ?? ''}>
                  {discOptions}
                </Select>
              </Field>
              <Field label={t('studio.create.language')}>
                <Select name="language" defaultValue={initial.language === 'ru' ? 'kk' : 'ru'}>
                  {langs}
                </Select>
              </Field>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {t('common.create')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
