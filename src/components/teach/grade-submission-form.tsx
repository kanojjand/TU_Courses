'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { gradeSubmissionAction } from '@/server/teach-actions';

export function GradeSubmissionForm({
  submissionId,
  maxScore,
  initialScore,
  initialFeedback,
  nextHref,
}: {
  submissionId: string;
  maxScore: number;
  initialScore: number | null;
  initialFeedback: string;
  nextHref: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const score = Number(String(fd.get('score') ?? '').replace(',', '.'));
        start(async () => {
          const res = await gradeSubmissionAction(submissionId, score, String(fd.get('feedback') ?? ''));
          if ('error' in res) {
            toast.error(res.error === 'invalid' ? t('teach.journal.invalidScore') : t('common.somethingWrong'));
            return;
          }
          toast.success(t('teach.review.graded'));
          router.push(nextHref);
          router.refresh();
        });
      }}
    >
      <Field label={t('teach.review.scoreOf', { max: maxScore })}>
        <Input name="score" inputMode="decimal" defaultValue={initialScore ?? ''} required className="max-w-40 text-lg font-semibold" autoFocus />
      </Field>
      <Field label={t('teach.review.feedback')}>
        <Textarea name="feedback" defaultValue={initialFeedback} maxLength={4000} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {t('teach.review.saveGrade')}
      </Button>
    </form>
  );
}
