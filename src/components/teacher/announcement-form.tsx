'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { createAnnouncement } from '@/server/actions/course-builder';

/** F-T-15. Объявление по курсу с уведомлением зачисленных студентов. */
export function AnnouncementForm({ courseId }: { courseId: string }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await createAnnouncement({
        courseId,
        title: String(formData.get('title') ?? ''),
        body: String(formData.get('body') ?? ''),
        isPinned: formData.get('pinned') === 'on',
      });
      setDone(true);
    });
  }

  return (
    <form action={submit} className="space-y-3">
      {done && <Alert tone="success">Объявление опубликовано, студенты уведомлены.</Alert>}
      <Field label="Заголовок" required>
        <Input name="title" required maxLength={200} />
      </Field>
      <Field label="Текст" required>
        <Textarea name="body" rows={3} required />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" /> Закрепить
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? '…' : 'Опубликовать'}
      </Button>
    </form>
  );
}
