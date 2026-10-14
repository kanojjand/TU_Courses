import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { attemptAnswers, questionOptions, questions, quizAttempts, quizzes } from '@/db/schema';
import { track } from './audit';
import { flattenLessons, offeringSnapshot } from './course';
import { writeAutoGrade } from './grades';
import { recomputeLesson, schemeForOffering } from './progress';
import { attemptScore, scoreAnswer, type QQuestion } from './rules/quiz';

export async function loadQuestions(ids: string[]): Promise<QQuestion[]> {
  if (!ids.length) return [];
  const qs = await db.select().from(questions).where(inArray(questions.id, ids));
  const opts = await db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.position));
  return qs.map((q) => ({
    id: q.id,
    type: q.type,
    difficulty: q.difficulty,
    data: q.data,
    options: opts.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, position: o.position, matchText: o.matchText })),
  }));
}

/**
 * Завершение попытки: подсчёт баллов, оценка в журнал по правилам сроков,
 * пересчёт урока. Повторный вызов ничего не меняет.
 */
export async function finishAttemptInternal(attemptId: string, userId: string) {
  const [a] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.studentId, userId)));
  if (!a || a.finishedAt) return a ?? null;
  const qs = await loadQuestions(a.layout.map((l) => l.q));
  const answers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));
  const ansBy = new Map(answers.map((x) => [x.questionId, x.answer]));
  const credits: number[] = [];
  for (const q of qs) {
    const credit = scoreAnswer(q, ansBy.get(q.id));
    credits.push(credit);
    if (ansBy.has(q.id)) await db.update(attemptAnswers).set({ credit }).where(and(eq(attemptAnswers.attemptId, attemptId), eq(attemptAnswers.questionId, q.id)));
    else await db.insert(attemptAnswers).values({ attemptId, questionId: q.id, answer: null, credit: 0 }).onConflictDoNothing();
  }
  const score = attemptScore(credits);
  // Время сдачи: фактическое, но не позже дедлайна попытки
  const finishedAt = a.deadlineAt && a.deadlineAt.getTime() < Date.now() ? a.deadlineAt : new Date();
  const [done] = await db
    .update(quizAttempts)
    .set({ finishedAt, score })
    .where(and(eq(quizAttempts.id, attemptId), isNull(quizAttempts.finishedAt)))
    .returning();
  if (!done) return a;
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, a.quizId));
  await writeAutoGrade(userId, quiz.blockId, score, a.startedAt);
  const snap = await offeringSnapshot(a.offeringId);
  const lesson = snap && flattenLessons(snap.snap).find((l) => l.blocks.some((b) => b.id === quiz.blockId));
  if (lesson) {
    const scheme = await schemeForOffering(a.offeringId);
    await recomputeLesson(userId, a.offeringId, lesson, scheme.videoThreshold);
  }
  await track(userId, 'quiz.finish', 'block', quiz.blockId);
  return done;
}
