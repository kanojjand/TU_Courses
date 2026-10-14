'use client';

import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { createCourseAction } from '@/server/studio-actions';

export function NewTemplateButton() {
  const t = useTranslations('reports.academic');
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => {
        const title = window.prompt(t('newTemplate'));
        if (!title) return;
        start(() => createCourseAction({ title, language: locale as 'ru', disciplineId: null, from: 'empty', sourceId: null }));
      }}
    >
      <Plus />
      {t('newTemplate')}
    </Button>
  );
}
