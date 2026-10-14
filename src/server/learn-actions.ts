'use server';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import {
  assignments,
  attemptAnswers,
  files,
  offerings,
  questionOptions,
  questions,
  quizAttempts,
  quizzes,
  submissions,
} from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { track } from '@/lib/audit';
import { flattenLessons, offeringSnapshot } from '@/lib/course';
import { writeAutoGrade } from '@/lib/grades';
import { blockWindow } from '@/lib/lesson';
import { notify } from '@/lib/notify';
import { recomputeLesson, schemeForOffering } from '@/lib/progress';
import { submissionDecision } from '@/lib/rules/deadlines';
import { attemptScore, optionOrder, pickQuestions, scoreAnswer, shuffle, type QQuestion } from '@/lib/rules/quiz';
import { studentOffering } from '@/lib/student';
import { isUuid } from '@/lib/utils';

async function lessonOfBlock(offeringId: string, blockId: string) {
  const snap = await offeringSnapshot(offeringId);
  if (!snap) return null;
  for (const l of flattenLessons(snap.snap)) {
    const b = l.blocks.find((x) => x.id === blockId);
    if (b) return { lesson: l, block: b };
  }
  return null;
}

async function guard(offeringId: string) {
  const user = await requireUser();
  if (!isUuid(offeringId)) throw new Error('BAD_REQUEST');
  const row = await studentOffering(user.id, offeringId);
  if (!row) throw new Error('FORBIDDEN');
  return { user, row };
}

/** Студент открыл урок: текст и файлы засчитываются, урок пересчитывается */
export async function markLessonVisited(offeringId: string, lessonId: string) {
  const { user } = await guard(offeringId);
  const snap = await offeringSnapshot(offeringId);
  const lesson = snap && flattenLessons(snap.snap).find((l) => l.id === lessonId);
  if (!lesson) return { done: false };
  const scheme = await schemeForOffering(offeringId);
  const done = await recomputeLesson(user.id, offeringId, lesson, scheme.videoThreshold);
  await track(user.id, 'lesson.view', 'lesson', lessonId);
  return { done };
}

/* ───────────────────────── Задания ───────────────────────── */

export async function submitAssignment(offeringId: string, blockId: string, fileIds: string[], text: string) {
  const { user, row } = await guard(offeringId);
  const found = await lessonOfBlock(offeringId, blockId);
  if (!found || found.block.type !== 'assignment') return { error: 'notFound' as const };
  const [as] = await db.select().from(assignments).where(eq(assignments.blockId, blockId));
  if (!as) return { error: 'notFound' as const };
  const cleanIds = fileIds.filter(isUuid).slice(0, as.maxFiles);
  if (cleanIds.length) {
    const own = await db.select({ id: files.id, owner: files.ownerId }).from(files).where(inArray(files.id, cleanIds));
    if (own.some((f) => f.owner !== user.id) || own.length !== cleanIds.length) return { error: 'forbidden' as const };
  }
  if (!cleanIds.length && !text.trim()) return { error: 'needSomething' as const };
  const window = await blockWindow(user.id, blockId);
  const decision = window ? submissionDecision(window) : { allowed: true, late: false };
  if (!decision.allowed) return { error: 'closed' as const };
  const [existing] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.studentId, user.id), eq(submissions.assignmentId, as.id), eq(submissions.offeringId, offeringId)));
  if (existing?.score !== null && existing?.score !== undefined) return { error: 'graded' as const };
  await db
    .insert(submissions)
    .values({ studentId: user.id, assignmentId: as.id, offeringId, fileIds: cleanIds, text: text.trim() || null, isLate: decision.late, submittedAt: new Date() })
    .onConflictDoUpdate({
      target: [submissions.studentId, submissions.assignmentId, submissions.offeringId],
      set: { fileIds: cleanIds, text: text.trim() || null, isLate: decision.late, submittedAt: new Date() },
    });
  const scheme = await schemeForOffering(offeringId);
  await recomputeLesson(user.id, offeringId, found.lesson, scheme.videoThreshold);
  await track(user.id, 'assignment.submit', 'block', blockId);
  if (row.offering.teacherId) await notify([row.offering.teacherId], 'submissionReceived', { item: found.block.title }, '/teach/review');
  revalidatePath(`/learn/${offeringId}/${found.lesson.id}`);
  return { ok: true as const };
}

/* ───────────────────────── Тесты ───────────────────────── */

async function loadQuestions(ids: string[]): Promise<QQuestion[]> {
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

export async function startQuiz(offeringId: string, blockId: string) {
  const { user } = await guard(offeringId);
  const found = await lessonOfBlock(offeringId, blockId);
  if (!found || found.block.type !== 'quiz') return { error: 'notFound' as const };
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.blockId, blockId));
  if (!quiz?.bankId) return { error: 'empty' as const };
  const existing = await db.select().from(quizAttempts).where(and(eq(quizAttempts.studentId, user.id), eq(quizAttempts.quizId, quiz.id)));
  const active = existing.find((a) => !a.finishedAt && (!a.deadlineAt || a.deadlineAt > new Date()));
  if (active) return { attemptId: active.id };
  // Незавершённые просроченные попытки закрываем
  for (const a of existing.filter((a) => !a.finishedAt)) await finishAttemptInternal(a.id, user.id);
  if (existing.length >= quiz.attemptsAllowed) return { error: 'noAttempts' as const };
  const window = await blockWindow(user.id, blockId);
  const decision = window ? submissionDecision(window) : { allowed: true, late: false };
  if (!decision.allowed) return { error: 'closed' as const };
  const pool = await db.select({ id: questions.id, difficulty: questions.difficulty }).from(questions).where(eq(questions.bankId, quiz.bankId));
  const picked = pickQuestions(pool, { easy: quiz.countEasy, medium: quiz.countMedium, hard: quiz.countHard });
  if (!picked.length) return { error: 'empty' as const };
  const full = await loadQuestions(picked.map((p) => p.id));
  const byId = new Map(full.map((q) => [q.id, q]));
  const ordered = quiz.shuffle ? shuffle(picked) : picked;
  const layout = ordered.map((p) => ({ q: p.id, o: optionOrder(byId.get(p.id)!, quiz.shuffle) }));
  let deadlineAt: Date | null = quiz.timeLimitMin ? new Date(Date.now() + quiz.timeLimitMin * 60_000) : null;
  if (window?.hardCloseAt && (!deadlineAt || window.hardCloseAt < deadlineAt)) deadlineAt = window.hardCloseAt;
  const [attempt] = await db.insert(quizAttempts).values({ studentId: user.id, quizId: quiz.id, offeringId, layout, deadlineAt }).returning();
  await track(user.id, 'quiz.start', 'block', blockId);
  return { attemptId: attempt.id };
}

async function ownAttempt(attemptId: string, userId: string) {
  if (!isUuid(attemptId)) return null;
  const [a] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.studentId, userId)));
  return a ?? null;
}

/** Автосохранение ответа. После дедлайна (с запасом 30 с на сеть) ответы не принимаются. */
export async function saveAnswer(attemptId: string, questionId: string, answer: unknown) {
  const user = await requireUser();
  const a = await ownAttempt(attemptId, user.id);
  if (!a || a.finishedAt) return { error: 'finished' as const };
  if (a.deadlineAt && Date.now() > a.deadlineAt.getTime() + 30_000) return { error: 'timeUp' as const };
  if (!a.layout.some((l) => l.q === questionId)) return { error: 'notFound' as const };
  const json = JSON.stringify(answer ?? null);
  if (json.length > 5000) return { error: 'tooLong' as const };
  await db
    .insert(attemptAnswers)
    .values({ attemptId, questionId, answer: answer as object, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [attemptAnswers.attemptId, attemptAnswers.questionId], set: { answer: answer as object, updatedAt: new Date() } });
  return { ok: true as const };
}

async function finishAttemptInternal(attemptId: string, userId: string) {
  const a = await ownAttempt(attemptId, userId);
  if (!a || a.finishedAt) return a;
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
  const found = await lessonOfBlock(a.offeringId, quiz.blockId);
  if (found) {
    const scheme = await schemeForOffering(a.offeringId);
    await recomputeLesson(userId, a.offeringId, found.lesson, scheme.videoThreshold);
  }
  await track(userId, 'quiz.finish', 'block', quiz.blockId);
  return done;
}

export async function finishQuiz(attemptId: string) {
  const user = await requireUser();
  const done = await finishAttemptInternal(attemptId, user.id);
  if (!done) return { error: 'notFound' as const };
  const [off] = await db.select({ id: offerings.id }).from(offerings).where(eq(offerings.id, done.offeringId));
  revalidatePath(`/learn/${off?.id}`);
  return { ok: true as const };
}
