import { and, asc, eq, inArray } from 'drizzle-orm';
import { CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { QuizRunner, QuizStart, type RunnerQuestion } from '@/components/learn/quiz-runner';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { attemptAnswers, questionOptions, questions, quizAttempts } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { flattenLessons, offeringSnapshot } from '@/lib/course';
import { quizInfo } from '@/lib/lesson';
import { studentOffering } from '@/lib/student';
import { isUuid } from '@/lib/utils';

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ offeringId: string; blockId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { offeringId, blockId } = await params;
  const { result } = await searchParams;
  if (!isUuid(offeringId) || !isUuid(blockId)) notFound();
  const user = await requireUser();
  const [t, row, snap] = await Promise.all([getTranslations(), studentOffering(user.id, offeringId), offeringSnapshot(offeringId)]);
  if (!row || !snap) notFound();
  const lesson = flattenLessons(snap.snap).find((l) => l.blocks.some((b) => b.id === blockId && b.type === 'quiz'));
  if (!lesson) notFound();
  const block = lesson.blocks.find((b) => b.id === blockId)!;
  const info = await quizInfo(user.id, blockId);
  if (!info) notFound();
  const backHref = `/learn/${offeringId}/quiz/${blockId}`;
  const lessonHref = `/learn/${offeringId}/${lesson.id}`;

  // Результат завершённой попытки
  if (result && isUuid(result)) {
    const [att] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, result), eq(quizAttempts.studentId, user.id)));
    if (att?.finishedAt) {
      const ans = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, att.id));
      const qs = await db.select().from(questions).where(inArray(questions.id, att.layout.map((l) => l.q)));
      const byId = new Map(qs.map((q) => [q.id, q]));
      const credit = new Map(ans.map((a) => [a.questionId, a.credit ?? 0]));
      return (
        <div className="mx-auto max-w-2xl">
          <PageHeader title={block.title} back={{ href: lessonHref, label: t('learn.quiz.backToLesson') }} />
          <Card className="mb-5 p-6 text-center">
            <p className="text-fg-muted">{t('learn.quiz.result')}</p>
            <p className="mt-1 text-5xl font-bold text-brand tabular-nums">{att.score}</p>
            <p className="mt-1 text-sm text-fg-muted">{t('learn.quiz.scoreOf', { score: att.score ?? 0 })}</p>
          </Card>
          {info.quiz.showResults && (
            <ol className="space-y-2">
              {att.layout.map((l, k) => {
                const c = credit.get(l.q) ?? 0;
                return (
                  <li key={l.q} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5">
                    {c >= 1 ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : c > 0 ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />}
                    <div className="min-w-0">
                      <p className="text-sm text-fg-muted">{k + 1}.</p>
                      <p className="leading-snug">{byId.get(l.q)?.text}</p>
                      <p className="mt-0.5 text-xs font-medium text-fg-muted">{c >= 1 ? t('learn.quiz.correct') : c > 0 ? t('learn.quiz.partly') : t('learn.quiz.incorrect')}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={lessonHref} className={buttonClass('primary', 'lg')}>
              {t('learn.quiz.backToLesson')}
            </Link>
          </div>
        </div>
      );
    }
  }

  if (info.activeAttemptId) {
    const [att] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, info.activeAttemptId));
    const ids = att.layout.map((l) => l.q);
    const [qs, opts, saved] = await Promise.all([
      db.select().from(questions).where(inArray(questions.id, ids)),
      db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.position)),
      db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, att.id)),
    ]);
    const qById = new Map(qs.map((q) => [q.id, q]));
    const oById = new Map(opts.map((o) => [o.id, o]));
    // Правильные ответы в браузер не уходят: только тексты вариантов в порядке попытки
    const runnerQuestions: RunnerQuestion[] = att.layout
      .filter((l) => qById.has(l.q))
      .map((l) => {
        const q = qById.get(l.q)!;
        return {
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.type === 'short' ? [] : l.o.map((oid) => oById.get(oid)).filter(Boolean).map((o) => ({ id: o!.id, text: o!.text, matchText: o!.matchText })),
        };
      });
    const initial = Object.fromEntries(saved.filter((s) => s.answer).map((s) => [s.questionId, s.answer as Record<string, unknown>]));
    return (
      <div>
        <h1 className="mx-auto mb-4 max-w-2xl text-xl font-bold">{block.title}</h1>
        <QuizRunner attemptId={att.id} questions={runnerQuestions} initialAnswers={initial} deadline={att.deadlineAt?.toISOString() ?? null} backHref={backHref} />
      </div>
    );
  }

  const left = info.quiz.attemptsAllowed - info.used;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={block.title} back={{ href: lessonHref, label: t('learn.quiz.backToLesson') }} />
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
          <span>{t('learn.quiz.questions', { n: info.questionCount })}</span>
          <span>{info.quiz.timeLimitMin ? t('learn.quiz.timeLimit', { n: info.quiz.timeLimitMin }) : t('learn.quiz.noTimeLimit')}</span>
          <span>{t('learn.quiz.attempts', { used: info.used, total: info.quiz.attemptsAllowed })}</span>
          {info.best !== null && <span className="font-medium text-success">{t('learn.quiz.best', { score: info.best })}</span>}
        </div>
        <p className="mb-2 font-semibold">{t('learn.quiz.rulesTitle')}</p>
        <ul className="mb-5 list-disc space-y-1 pl-5 text-[0.9375rem]">
          <li>{t('learn.quiz.rule1')}</li>
          <li>{t('learn.quiz.rule2')}</li>
          <li>{t('learn.quiz.rule3')}</li>
        </ul>
        {info.decision.timing === 'late' && <p className="mb-3 text-sm font-medium text-warning">{t('learn.quiz.lateWarning')}</p>}
        {!info.decision.allowed ? (
          <p className="font-medium text-danger">{info.decision.timing === 'closed' ? t('learn.quiz.closed') : t('learn.quiz.notOpen', { date: info.window?.opensAt?.toLocaleDateString() ?? '' })}</p>
        ) : left <= 0 ? (
          <p className="font-medium text-fg-muted">{t('learn.quiz.noAttemptsLeft')}</p>
        ) : info.questionCount === 0 ? (
          <p className="text-fg-muted">{t('learn.quiz.empty')}</p>
        ) : (
          <QuizStart offeringId={offeringId} blockId={blockId} label={info.used > 0 ? t('learn.quiz.retry') : t('learn.quiz.start')} />
        )}
      </Card>
    </div>
  );
}
