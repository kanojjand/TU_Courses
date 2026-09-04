'use server';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';

/** Запросы для клиентских компонентов конструктора (F-T-08, F-T-09, F-T-10). */

export async function listBankQuestions(courseId: string) {
  await requireCourseTeacher(courseId);

  const questions = await prisma.question.findMany({
    where: { bank: { courseId }, isActive: true },
    include: { topic: true },
    orderBy: { createdAt: 'desc' },
  });

  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type as string,
    difficulty: q.difficulty as string,
    topic: q.topic?.name ?? null,
    defaultPoints: dec(q.defaultPoints),
  }));
}

export async function listQuizQuestions(quizId: string) {
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    include: {
      questions: { orderBy: { orderIndex: 'asc' } },
      contentItem: { select: { module: { select: { courseId: true } } } },
    },
  });
  await requireCourseTeacher(quiz.contentItem.module.courseId);

  return {
    questions: quiz.questions.map((q) => ({
      questionId: q.questionId,
      points: dec(q.points),
    })),
    settings: {
      timeLimitMin: quiz.timeLimitMin,
      maxAttempts: quiz.maxAttempts,
      gradingMethod: quiz.gradingMethod as string,
      passingScore: quiz.passingScore,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleOptions: quiz.shuffleOptions,
      showResultImmediately: quiz.showResultImmediately,
      showCorrectAnswers: quiz.showCorrectAnswers,
      randomSelection: quiz.randomSelection,
      randomCount: quiz.randomCount,
    },
  };
}

export async function getAssignmentSettings(assignmentId: string) {
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });
  await requireCourseTeacher(a.contentItem.module.courseId);

  return {
    instructions: a.instructions,
    dueAt: a.dueAt?.toISOString() ?? null,
    allowLate: a.allowLate,
    latePenaltyPerDay: dec(a.latePenaltyPerDay),
    latePenaltyMax: dec(a.latePenaltyMax),
    maxScore: dec(a.maxScore),
    allowedExtensions: a.allowedExtensions,
    maxFileSizeMb: a.maxFileSizeMb,
    maxFiles: a.maxFiles,
  };
}
