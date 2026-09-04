import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requireEnrolledStudent } from '@/server/guards';
import { QuizRunner } from '@/components/student/quiz-runner';
import { startAttempt } from '@/server/actions/quiz';

export const dynamic = 'force-dynamic';

/** F-S-07. Прохождение теста. */
export default async function QuizPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; quizId: string }>;
}) {
  const { locale, id, quizId } = await params;
  setRequestLocale(locale);
  await requireEnrolledStudent(id);

  const { attemptId } = await startAttempt(quizId);

  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      answers: true,
      quiz: {
        include: {
          contentItem: { select: { title: true } },
          questions: { include: { question: { include: { options: true } } } },
        },
      },
    },
  });

  if (!attempt.quiz.questions.length) notFound();

  const order = attempt.questionOrder as {
    questions?: string[];
    options?: Record<string, string[]>;
  } | null;

  const byId = new Map(attempt.quiz.questions.map((qq) => [qq.questionId, qq]));
  const orderedIds = order?.questions ?? attempt.quiz.questions.map((q) => q.questionId);

  const questions = orderedIds
    .map((qid) => byId.get(qid))
    .filter((qq): qq is NonNullable<typeof qq> => Boolean(qq))
    .map((qq) => {
      const optionOrder = order?.options?.[qq.questionId];
      const options = optionOrder
        ? optionOrder
            .map((oid) => qq.question.options.find((o) => o.id === oid))
            .filter((o): o is NonNullable<typeof o> => Boolean(o))
        : [...qq.question.options].sort((a, b) => a.orderIndex - b.orderIndex);

      return {
        id: qq.questionId,
        type: qq.question.type,
        text: qq.question.text,
        points: dec(qq.points),
        // Правильные ответы студенту не передаются
        options: options.map((o) => ({
          id: o.id,
          text: o.text,
          ...(qq.question.type === 'MATCHING' ? { matchKey: o.matchKey } : {}),
        })),
        savedResponse:
          (attempt.answers.find((a) => a.questionId === qq.questionId)?.response as
            | Record<string, unknown>
            | null) ?? null,
      };
    });

  // Для вопросов на соответствие правые части перемешиваются отдельно
  const matchPools: Record<string, string[]> = {};
  for (const q of questions) {
    if (q.type === 'MATCHING') {
      matchPools[q.id] = (q.options as { matchKey?: string | null }[])
        .map((o) => o.matchKey ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ru'));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <QuizRunner
        attemptId={attemptId}
        courseId={id}
        title={attempt.quiz.contentItem.title}
        questions={questions.map((q) => ({
          id: q.id,
          type: q.type,
          text: q.text,
          points: q.points,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
          matchPool: matchPools[q.id] ?? [],
          savedResponse: q.savedResponse,
        }))}
        expiresAt={attempt.expiresAt?.toISOString() ?? null}
        showResultImmediately={attempt.quiz.showResultImmediately}
      />
    </div>
  );
}
