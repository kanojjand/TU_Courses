import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CourseSnapshot } from '@/lib/course';
import { cn } from '@/lib/utils';

/** Содержание курса: модули по неделям, уроки с отметками */
export async function CourseOutline({
  snap,
  offeringId,
  completed,
  seen,
  current,
  compact,
}: {
  snap: CourseSnapshot;
  offeringId: string;
  completed: Set<string>;
  seen: Set<string>;
  current?: string;
  compact?: boolean;
}) {
  const t = await getTranslations();
  return (
    <ol className="space-y-4">
      {snap.modules.map((m) => {
        const done = m.lessons.filter((l) => completed.has(l.id)).length;
        return (
          <li key={m.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
              <p className="min-w-0 text-sm font-semibold">
                <span className="mr-1.5 text-fg-muted">{t('common.weekN', { n: m.week })}.</span>
                {m.title}
              </p>
              <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                {done}/{m.lessons.length}
              </span>
            </div>
            <ul className={cn('overflow-hidden rounded-xl border border-border bg-surface', compact && 'text-sm')}>
              {m.lessons.map((l) => {
                const isDone = completed.has(l.id);
                const isCur = l.id === current;
                return (
                  <li key={l.id} className="border-b border-border last:border-0">
                    <Link
                      href={`/learn/${offeringId}/${l.id}`}
                      aria-current={isCur ? 'page' : undefined}
                      className={cn('flex min-h-12 items-center gap-3 px-3 py-2 hover:bg-surface-2/60', isCur && 'bg-brand-soft')}
                    >
                      {isDone ? (
                        <CheckCircle2 className="size-5 shrink-0 text-success" aria-label={t('learn.lessonDone')} />
                      ) : seen.has(l.id) ? (
                        <CircleDot className="size-5 shrink-0 text-warning" aria-label={t('learn.lessonInProgress')} />
                      ) : (
                        <Circle className="size-5 shrink-0 text-fg-muted/60" />
                      )}
                      <span className={cn('min-w-0 flex-1 leading-snug', isCur && 'font-semibold text-brand')}>{l.title}</span>
                      {l.estMinutes ? <span className="shrink-0 text-xs text-fg-muted">{t('learn.minutes', { n: l.estMinutes })}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
