'use client';

import { CheckCircle2, Send, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import type { CourseStatus } from '@/db/schema';
import { publishCourseAction, returnCourseAction, submitForReviewAction } from '@/server/studio-actions';

/** Кнопки статуса: черновик → на проверке у кафедры → опубликован */
export function StatusActions({
  courseId,
  status,
  canEdit,
  canApprove,
  hasChanges,
  isTemplate,
}: {
  courseId: string;
  status: CourseStatus;
  canEdit: boolean;
  canApprove: boolean;
  hasChanges: boolean;
  isTemplate: boolean;
}) {
  const t = useTranslations('studio.status');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState('');
  const canSubmit = canEdit && !isTemplate && (status === 'draft' || (status === 'published' && hasChanges));
  const canPublish = canApprove && (status === 'review' || (status === 'published' && hasChanges) || (isTemplate && status === 'draft'));
  return (
    <div className="flex flex-wrap gap-2">
      {canSubmit && (
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await submitForReviewAction(courseId);
              toast.success(t('submitted'));
              router.refresh();
            })
          }
        >
          <Send />
          {t('submit')}
        </Button>
      )}
      {canPublish && (
        <Button
          variant="success"
          disabled={pending}
          title={t('publishHint')}
          onClick={() =>
            start(async () => {
              const res = await publishCourseAction(courseId);
              toast.success(t('published', { n: res.version, streams: res.attached }));
              router.refresh();
            })
          }
        >
          <CheckCircle2 />
          {t('approve')}
        </Button>
      )}
      {canApprove && status === 'review' && (
        <Button variant="secondary" disabled={pending} onClick={() => setReturning(true)}>
          <Undo2 />
          {t('returnDraft')}
        </Button>
      )}
      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent title={t('returnDraft')}>
          <div className="space-y-3">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('returnComment')} aria-label={t('returnComment')} />
            <Button
              className="w-full"
              disabled={pending || !comment.trim()}
              onClick={() =>
                start(async () => {
                  await returnCourseAction(courseId, comment);
                  toast.success(t('returned'));
                  setReturning(false);
                  router.refresh();
                })
              }
            >
              {tc('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
