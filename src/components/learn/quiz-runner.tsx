'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Timer, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { finishQuiz, saveAnswer, startQuiz } from '@/server/learn-actions';

export type RunnerQuestion = {
  id: string;
  type: 'single' | 'multiple' | 'matching' | 'ordering' | 'short';
  text: string;
  options: { id: string; text: string; matchText: string | null }[];
};

type Answer = { option?: string; options?: string[]; pairs?: Record<string, string>; order?: string[]; text?: string };

function isAnswered(q: RunnerQuestion, a: Answer | undefined) {
  if (!a) return false;
  if (q.type === 'single') return !!a.option;
  if (q.type === 'multiple') return !!a.options?.length;
  if (q.type === 'matching') return Object.keys(a.pairs ?? {}).length >= q.options.filter((o) => o.matchText).length;
  if (q.type === 'ordering') return !!a.order?.length;
  return !!a.text?.trim();
}

export function QuizStart({ offeringId, blockId, label }: { offeringId: string; blockId: string; label: string }) {
  const router = useRouter();
  const tc = useTranslations('common');
  const t = useTranslations('learn.quiz');
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full sm:w-auto"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await startQuiz(offeringId, blockId);
          if ('error' in res) {
            toast.error(res.error === 'noAttempts' ? t('noAttemptsLeft') : res.error === 'closed' ? t('closed') : res.error === 'empty' ? t('empty') : tc('somethingWrong'));
            return;
          }
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}

export function QuizRunner({
  attemptId,
  questions,
  initialAnswers,
  deadline,
  backHref,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, Answer>;
  deadline: string | null;
  backHref: string;
}) {
  const t = useTranslations('learn.quiz');
  const tc = useTranslations('common');
  const router = useRouter();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(initialAnswers);
  const [offline, setOffline] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const queue = useRef<Map<string, Answer>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [left, setLeft] = useState<number | null>(deadline ? Math.max(0, new Date(deadline).getTime() - Date.now()) : null);
  const q = questions[i];
  const answeredCount = questions.filter((x) => isAnswered(x, answers[x.id])).length;

  const send = useCallback(
    async (qid: string, a: Answer) => {
      try {
        const res = await saveAnswer(attemptId, qid, a);
        if ('error' in res) {
          if (res.error === 'finished' || res.error === 'timeUp') router.refresh();
          return;
        }
        queue.current.delete(qid);
        setOffline(false);
      } catch {
        queue.current.set(qid, a);
        setOffline(true);
      }
    },
    [attemptId, router],
  );

  function setAnswer(qid: string, a: Answer, debounce = 0) {
    setAnswers((prev) => ({ ...prev, [qid]: a }));
    const prevTimer = timers.current.get(qid);
    if (prevTimer) clearTimeout(prevTimer);
    timers.current.set(
      qid,
      setTimeout(() => void send(qid, a), debounce),
    );
  }

  // Повторная отправка неотправленных ответов, когда сеть вернулась
  useEffect(() => {
    const retry = () => queue.current.forEach((a, qid) => void send(qid, a));
    window.addEventListener('online', retry);
    const id = setInterval(retry, 10_000);
    return () => {
      window.removeEventListener('online', retry);
      clearInterval(id);
    };
  }, [send]);

  const finish = useCallback(async () => {
    setFinishing(true);
    timers.current.forEach((tm) => clearTimeout(tm));
    await Promise.all([...Object.entries(answers)].map(([qid, a]) => (queue.current.has(qid) ? send(qid, a) : null)));
    const res = await finishQuiz(attemptId);
    if ('error' in res) {
      toast.error(tc('somethingWrong'));
      setFinishing(false);
      return;
    }
    router.replace(`${backHref}?result=${attemptId}`);
    router.refresh();
  }, [answers, attemptId, backHref, router, send, tc]);

  useEffect(() => {
    if (left === null) return;
    const end = Date.now() + left;
    const id = setInterval(() => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        toast.info(t('timeUp'));
        void finish();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rightChoices = useMemo(
    () => (q?.type === 'matching' ? [...q.options.filter((o) => o.matchText)].sort((a, b) => a.matchText!.localeCompare(b.matchText!)) : []),
    [q],
  );

  if (!q) return null;
  const a = answers[q.id] ?? {};
  const mm = left !== null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : null;
  const order = q.type === 'ordering' ? (a.order?.length ? a.order : q.options.map((o) => o.id)) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-16 z-20 -mx-4 mb-4 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-surface">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{t('questionOf', { n: i + 1, total: questions.length })}</span>
          {offline && (
            <span className="inline-flex items-center gap-1 text-xs text-warning" title={t('savedOffline')}>
              <WifiOff className="size-4" />
            </span>
          )}
          {mm && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums', left! < 60_000 ? 'bg-danger text-white' : 'bg-surface-2')}>
              <Timer className="size-4" />
              {t('timeLeft', { time: mm })}
            </span>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="navigation">
          {questions.map((x, k) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={String(k + 1)}
              aria-current={k === i ? 'step' : undefined}
              className={cn(
                'size-8 rounded-md border text-xs font-semibold',
                k === i ? 'border-brand bg-brand text-brand-fg' : isAnswered(x, answers[x.id]) ? 'border-success/40 bg-success-soft text-success' : 'border-border bg-surface text-fg-muted',
              )}
            >
              {k + 1}
            </button>
          ))}
        </div>
      </div>

      <div data-card className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <p className="text-lg leading-snug font-semibold whitespace-pre-wrap">{q.text}</p>
        <p className="mt-1 mb-4 text-sm text-fg-muted">
          {q.type === 'single' ? t('chooseOne') : q.type === 'multiple' ? t('chooseMany') : q.type === 'matching' ? t('matchHint') : q.type === 'ordering' ? t('orderHint') : t('shortHint')}
        </p>

        {(q.type === 'single' || q.type === 'multiple') && (
          <div className="space-y-2">
            {q.options.map((o) => {
              const checked = q.type === 'single' ? a.option === o.id : !!a.options?.includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors', checked ? 'border-brand bg-brand-soft' : 'border-border hover:bg-surface-2')}
                >
                  <input
                    type={q.type === 'single' ? 'radio' : 'checkbox'}
                    name={q.id}
                    checked={checked}
                    onChange={(e) => {
                      if (q.type === 'single') setAnswer(q.id, { option: o.id });
                      else {
                        const set = new Set(a.options ?? []);
                        if (e.target.checked) set.add(o.id);
                        else set.delete(o.id);
                        setAnswer(q.id, { options: [...set] });
                      }
                    }}
                    className="size-5 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="text-[0.9375rem]">{o.text}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.type === 'matching' && (
          <div className="space-y-3">
            {q.options
              .filter((o) => o.matchText)
              .map((o) => (
                <div key={o.id} className="grid gap-2 sm:grid-cols-2 sm:items-center">
                  <span className="font-medium">{o.text}</span>
                  <select
                    value={a.pairs?.[o.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, { pairs: { ...(a.pairs ?? {}), [o.id]: e.target.value } })}
                    className="h-11 rounded-lg border border-border bg-surface px-3"
                    aria-label={o.text}
                  >
                    <option value="">{tc('choose')}</option>
                    {rightChoices.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.matchText}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        )}

        {q.type === 'ordering' && (
          <ol className="space-y-2">
            {order.map((id, k) => {
              const o = q.options.find((x) => x.id === id)!;
              const move = (dir: -1 | 1) => {
                const next = [...order];
                const j = k + dir;
                if (j < 0 || j >= next.length) return;
                [next[k], next[j]] = [next[j], next[k]];
                setAnswer(q.id, { order: next });
              };
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="w-6 text-center font-semibold text-fg-muted">{k + 1}</span>
                  <span className="min-w-0 flex-1">{o?.text}</span>
                  <Button size="icon-sm" variant="ghost" onClick={() => move(-1)} disabled={k === 0} aria-label={t('up')}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => move(1)} disabled={k === order.length - 1} aria-label={t('down')}>
                    <ArrowDown />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}

        {q.type === 'short' && (
          <Input value={a.text ?? ''} onChange={(e) => setAnswer(q.id, { text: e.target.value }, 600)} placeholder={t('shortHint')} maxLength={300} autoComplete="off" />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" size="lg" onClick={() => setI(i - 1)} disabled={i === 0}>
          <ArrowLeft />
          {tc('previous')}
        </Button>
        {i < questions.length - 1 ? (
          <Button size="lg" onClick={() => setI(i + 1)}>
            {tc('next')}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            size="lg"
            variant="success"
            disabled={finishing}
            onClick={() => {
              const missing = questions.length - answeredCount;
              if (missing > 0 && !window.confirm(t('finishConfirm', { n: missing }))) return;
              void finish();
            }}
          >
            <Check />
            {t('finish')}
          </Button>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-fg-muted">{t('answered', { n: answeredCount, total: questions.length })}</p>
      {i < questions.length - 1 && (
        <div className="mt-4 text-center">
          <Button
            variant="link"
            disabled={finishing}
            onClick={() => {
              const missing = questions.length - answeredCount;
              if (!window.confirm(t('finishConfirm', { n: missing }))) return;
              void finish();
            }}
          >
            {t('finish')}
          </Button>
        </div>
      )}
    </div>
  );
}
