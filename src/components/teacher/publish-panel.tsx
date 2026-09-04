'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { publishCourse, setCoursePublic, submitForReview } from '@/server/actions/course-builder';

/** F-T-14, F-P-04. Согласование, публикация и отображение в каталоге. */
export function PublishPanel({
  courseId,
  status,
  isPublic,
  canPublish,
  needsReview,
  hoursValid,
  hoursDelta,
}: {
  courseId: string;
  status: string;
  isPublic: boolean;
  canPublish: boolean;
  needsReview: boolean;
  hoursValid: boolean;
  hoursDelta: number;
}) {
  const t = useTranslations('teacher');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [publicFlag, setPublicFlag] = useState(isPublic);
  const [pending, startTransition] = useTransition();

  const published = status === 'PUBLISHED';
  const canSendReview = needsReview && ['DRAFT', 'REJECTED'].includes(status);
  const canPublishNow = !needsReview ? !published : status === 'APPROVED';

  function send() {
    startTransition(async () => {
      const result = await submitForReview(courseId);
      setMessage(
        result.ok
          ? { tone: 'success', text: 'Курс отправлен методисту на согласование.' }
          : { tone: 'danger', text: result.validation.issues.map((i) => i.message).join(' ') }
      );
    });
  }

  function publish() {
    startTransition(async () => {
      const result = await publishCourse(courseId);
      setMessage(
        result.ok
          ? { tone: 'success', text: 'Курс опубликован.' }
          : { tone: 'danger', text: result.reason }
      );
    });
  }

  function toggleCatalog(next: boolean) {
    setPublicFlag(next);
    startTransition(() => setCoursePublic(courseId, next));
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader><CardTitle>Публикация</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        {/* Критерий приёмки № 2: причина блокировки публикации указывается явно */}
        {!hoursValid && (
          <Alert tone="warning">
            {t('publishBlocked')}
            {hoursDelta !== 0 && (
              <span className="mt-1 block">
                Расхождение: {hoursDelta > 0 ? '+' : ''}
                {hoursDelta} академических часов.
              </span>
            )}
          </Alert>
        )}

        {!canPublish && (
          <Alert tone="info">
            Тьютор не имеет права публикации курса и утверждения итоговых оценок.
          </Alert>
        )}

        {canSendReview && (
          <Button
            className="w-full"
            variant="outline"
            onClick={send}
            disabled={pending || !hoursValid || !canPublish}
          >
            {t('sendToReview')}
          </Button>
        )}

        {status === 'ON_REVIEW' && (
          <Alert tone="info">Курс находится на согласовании у методиста кафедры.</Alert>
        )}

        <Button
          className="w-full"
          onClick={publish}
          disabled={pending || !hoursValid || !canPublish || !canPublishNow || published}
          title={
            !hoursValid
              ? t('publishBlocked')
              : !canPublishNow
                ? 'Требуется согласование методиста'
                : undefined
          }
        >
          {published ? t('published') : t('publish')}
        </Button>

        <label className="flex cursor-pointer items-start gap-2.5 border-t border-border pt-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={publicFlag}
            disabled={pending}
            onChange={(e) => toggleCatalog(e.target.checked)}
          />
          <span>
            Показывать в публичном каталоге
            <span className="mt-0.5 block text-xs text-fg-muted">
              Учебное содержимое остаётся недоступным неавторизованным пользователям.
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}
