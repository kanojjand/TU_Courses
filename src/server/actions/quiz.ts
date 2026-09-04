'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { prisma, dec } from '@/lib/prisma';
import { requireEnrolledStudent, requireCourseTeacher, requireUser } from '@/server/guards';
import { evaluateItemCompletion } from '@/server/progress';
import { setGrade } from '@/server/grades';
import {
  gradeAttempt,
  resolveAttemptScore,
  shuffleWithSeed,
  type AnswerResponse,
  type QuestionSpec,
} from '@/domain/quiz';

/**
 * Прохождение и проверка тестов — F-S-07, F-T-09.
 * Критерий приёмки № 4: тест из 20 вопросов четырёх типов проверяется
 * автоматически, результат поступает в журнал.
 */

/** Начало или продолжение попытки. Промежуточное состояние сохраняется. */
export async function startAttempt(quizId: string): Promise<{ attemptId: string }> {
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    include: {
      contentItem: { select: { module: { select: { courseId: true } } } },
      questions: { include: { question: { include: { options: true } } } },
    },
  });

  const courseId = quiz.contentItem.module.courseId;
  const { studentId } = await requireEnrolledStudent(courseId);

  const now = new Date();
  if (quiz.opensAt && quiz.opensAt > now) throw new Error('Тест ещё не открыт.');
  if (quiz.closesAt && quiz.closesAt < now) throw new Error('Тест закрыт.');

  // Незавершённая попытка возобновляется — сохранение состояния при обрыве связи
  const active = await prisma.quizAttempt.findFirst({
    where: { quizId, studentId, status: 'IN_PROGRESS' },
    orderBy: { attemptNo: 'desc' },
  });

  if (active) {
    if (active.expiresAt && active.expiresAt < now) {
      await finishAttempt(active.id, true);
    } else {
      return { attemptId: active.id };
    }
  }

  const used = await prisma.quizAttempt.count({ where: { quizId, studentId } });
  if (used >= quiz.maxAttempts) {
    throw new Error(`Исчерпано число попыток (${quiz.maxAttempts}).`);
  }

  const attemptNo = used + 1;

  // Набор вопросов: ручной отбор или случайная выборка из банка (F-T-09)
  let questionIds = quiz.questions
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((q) => q.questionId);

  if (quiz.randomSelection && quiz.randomCount) {
    const bank = await prisma.question.findMany({
      where: {
        bank: { courseId },
        isActive: true,
        ...(quiz.randomTopicIds.length ? { topicId: { in: quiz.randomTopicIds } } : {}),
        ...(quiz.randomDifficulty ? { difficulty: quiz.randomDifficulty } : {}),
      },
      select: { id: true },
    });
    questionIds = shuffleWithSeed(
      bank.map((q) => q.id),
      `${quizId}:${studentId}:${attemptNo}`
    ).slice(0, quiz.randomCount);
  }

  // Детерминированное перемешивание: при обрыве связи порядок сохраняется
  const seed = `${quizId}:${studentId}:${attemptNo}`;
  const order = quiz.shuffleQuestions ? shuffleWithSeed(questionIds, seed) : questionIds;

  const optionOrder: Record<string, string[]> = {};
  if (quiz.shuffleOptions) {
    for (const qq of quiz.questions) {
      optionOrder[qq.questionId] = shuffleWithSeed(
        qq.question.options.map((o) => o.id),
        `${seed}:${qq.questionId}`
      );
    }
  }

  const h = await headers();
  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      studentId,
      attemptNo,
      expiresAt: quiz.timeLimitMin ? new Date(Date.now() + quiz.timeLimitMin * 60_000) : null,
      questionOrder: { questions: order, options: optionOrder },
      ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: h.get('user-agent'),
    },
  });

  const user = await requireUser();
  await prisma.activityLog.create({
    data: { userId: user.id, courseId, type: 'START_QUIZ', meta: { quizId, attemptNo } },
  });

  return { attemptId: attempt.id };
}

/** Сохранение ответа по мере прохождения (защита от потери при обрыве связи) */
export async function saveAnswer(
  attemptId: string,
  questionId: string,
  response: AnswerResponse
): Promise<void> {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      status: true,
      expiresAt: true,
      student: { select: { userId: true } },
    },
  });

  const user = await requireUser();
  if (attempt.student.userId !== user.id) throw new Error('Попытка принадлежит другому студенту.');
  if (attempt.status !== 'IN_PROGRESS') throw new Error('Попытка уже завершена.');
  if (attempt.expiresAt && attempt.expiresAt < new Date()) {
    await finishAttempt(attemptId, true);
    throw new Error('Время на выполнение теста истекло.');
  }

  await prisma.quizAnswer.upsert({
    where: { attemptId_questionId: { attemptId, questionId } },
    create: { attemptId, questionId, response: response ?? undefined },
    update: { response: response ?? undefined, answeredAt: new Date() },
  });
}

/** Завершение попытки и автоматическая проверка */
export async function finishAttempt(
  attemptId: string,
  expired = false
): Promise<{ score: number; maxScore: number; percent: number; passed: boolean }> {
  const attempt = await prisma.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      answers: true,
      student: { select: { id: true, userId: true } },
      quiz: {
        include: {
          questions: { include: { question: { include: { options: true } } } },
          contentItem: {
            select: { id: true, module: { select: { courseId: true } } },
          },
          gradeItem: true,
        },
      },
    },
  });

  if (attempt.status !== 'IN_PROGRESS') {
    return {
      score: dec(attempt.score),
      maxScore: dec(attempt.maxScore),
      percent: dec(attempt.percent),
      passed: dec(attempt.percent) >= attempt.quiz.passingScore,
    };
  }

  const orderData = attempt.questionOrder as { questions?: string[] } | null;
  const includedIds = new Set(orderData?.questions ?? attempt.quiz.questions.map((q) => q.questionId));

  const specs: QuestionSpec[] = attempt.quiz.questions
    .filter((qq) => includedIds.has(qq.questionId))
    .map((qq) => ({
      id: qq.questionId,
      type: qq.question.type,
      points: dec(qq.points),
      options: qq.question.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        orderIndex: o.orderIndex,
        matchKey: o.matchKey,
      })),
      payload: qq.question.payload as QuestionSpec['payload'],
    }));

  const responses: Record<string, AnswerResponse> = {};
  for (const a of attempt.answers) responses[a.questionId] = a.response as AnswerResponse;

  const result = gradeAttempt(specs, responses, attempt.quiz.passingScore);

  await prisma.$transaction([
    prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        status: expired ? 'EXPIRED' : 'GRADED',
        submittedAt: new Date(),
        score: result.score,
        maxScore: result.maxScore,
        percent: result.percent,
      },
    }),
    ...result.answers.map((a) =>
      prisma.quizAnswer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: {
          attemptId,
          questionId: a.questionId,
          isCorrect: a.isCorrect,
          points: a.points,
        },
        update: { isCorrect: a.isCorrect, points: a.points },
      })
    ),
    prisma.activityLog.create({
      data: {
        userId: attempt.student.userId,
        courseId: attempt.quiz.contentItem.module.courseId,
        contentItemId: attempt.quiz.contentItem.id,
        type: 'SUBMIT_QUIZ',
        meta: { percent: result.percent, attemptNo: attempt.attemptNo },
      },
    }),
  ]);

  // Результат поступает в журнал (критерий приёмки № 4)
  if (attempt.quiz.gradeItem) {
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: attempt.quizId, studentId: attempt.student.id, status: 'GRADED' },
      select: { attemptNo: true, percent: true, score: true },
    });

    const resolved = resolveAttemptScore(
      attempts.map((a) => ({
        attemptNo: a.attemptNo,
        percent: dec(a.percent),
        score: dec(a.score),
      })),
      attempt.quiz.gradingMethod
    );

    if (resolved) {
      const maxScore = dec(attempt.quiz.gradeItem.maxScore);
      await setGrade({
        gradeItemId: attempt.quiz.gradeItem.id,
        studentId: attempt.student.id,
        score: Math.round((resolved.percent / 100) * maxScore * 100) / 100,
        actorId: attempt.student.userId,
        actorEmail: 'system:auto-grading',
        comment: `Автоматическая проверка теста, попытка ${attempt.attemptNo}`,
      });
    }
  }

  await evaluateItemCompletion({
    contentItemId: attempt.quiz.contentItem.id,
    studentId: attempt.student.id,
    userId: attempt.student.userId,
  });

  revalidatePath(`/my/courses/${attempt.quiz.contentItem.module.courseId}`);

  return {
    score: result.score,
    maxScore: result.maxScore,
    percent: result.percent,
    passed: result.passed,
  };
}

/** F-T-09. Настройка теста преподавателем. */
export async function updateQuizSettings(input: {
  quizId: string;
  timeLimitMin?: number | null;
  maxAttempts?: number;
  gradingMethod?: 'HIGHEST' | 'LAST' | 'AVERAGE' | 'FIRST';
  passingScore?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResultImmediately?: boolean;
  showCorrectAnswers?: boolean;
  randomSelection?: boolean;
  randomCount?: number | null;
  randomTopicIds?: string[];
}) {
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: input.quizId },
    select: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });
  await requireCourseTeacher(quiz.contentItem.module.courseId);

  const { quizId, ...data } = input;
  await prisma.quiz.update({ where: { id: quizId }, data });
  revalidatePath(`/teach/courses/${quiz.contentItem.module.courseId}/builder`);
}

/** Отбор вопросов в тест вручную */
export async function setQuizQuestions(
  quizId: string,
  items: { questionId: string; points: number }[]
) {
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    select: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });
  await requireCourseTeacher(quiz.contentItem.module.courseId);

  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { quizId } }),
    prisma.quizQuestion.createMany({
      data: items.map((it, i) => ({
        quizId,
        questionId: it.questionId,
        points: it.points,
        orderIndex: i,
      })),
    }),
  ]);

  revalidatePath(`/teach/courses/${quiz.contentItem.module.courseId}/builder`);
}
