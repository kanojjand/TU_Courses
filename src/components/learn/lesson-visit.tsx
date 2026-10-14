'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markLessonVisited } from '@/server/learn-actions';

/** Отмечает открытие урока (не при предзагрузке ссылки — только у реального посетителя) */
export function LessonVisit({ offeringId, lessonId, wasDone }: { offeringId: string; lessonId: string; wasDone: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    markLessonVisited(offeringId, lessonId)
      .then((r) => {
        if (!cancelled && r.done && !wasDone) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [offeringId, lessonId, wasDone, router]);
  return null;
}
