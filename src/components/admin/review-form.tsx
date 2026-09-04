'use client';

import { useState, useTransition } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { decideCourseReview } from '@/server/actions/admin';

/** Решение методиста: согласовать или вернуть на доработку. */
export function ReviewForm({ courseId, hoursValid }: { courseId: string; hoursValid: boolean }) {
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(approved: boolean) {
    if (!approved && comment.trim().length < 5) {
      setDone('Укажите причину возврата на доработку.');
      return;
    }
    startTransition(async () => {
      await decideCourseReview(courseId, approved, comment.trim() || undefined);
      setDone(approved ? 'Курс согласован.' : 'Курс возвращён на доработку.');
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Решение</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {done && <Alert tone="success">{done}</Alert>}
        {!hoursValid && (
          <Alert tone="warning">
            Объём курса не соответствует объёму дисциплины в кредитах. Согласование
            такого курса не позволит его опубликовать.
          </Alert>
        )}

        <Field label="Комментарий" hint="Обязателен при возврате на доработку">
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide(true)} disabled={pending}>
            Согласовать
          </Button>
          <Button variant="outline" onClick={() => decide(false)} disabled={pending}>
            Вернуть на доработку
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
