import 'server-only';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  assignments,
  gradeSchemes,
  lessonProgress,
  offerings,
  quizAttempts,
  quizzes,
  submissions,
  videoProgress,
} from '@/db/schema';
import { chunk } from './utils';
import type { CourseSnapshot, SnapLesson } from './course';
import { flattenLessons } from './course';

export type SchemeRow = typeof gradeSchemes.$inferSelect;

export const DEFAULT_SCHEME: Omit<SchemeRow, 'id' | 'title' | 'updatedAt' | 'isDefault'> = {
  currentWeight: 0.6,
  admissionThreshold: 50,
  rkMinScore: 0,
  lateRule: 'penalty',
  latePenaltyPct: 20,
  videoThreshold: 90,
  rk1Week: 7,
  rk2Week: 15,
};

export async function defaultScheme(): Promise<SchemeRow> {
  const [s] = await db.select().from(gradeSchemes).where(eq(gradeSchemes.isDefault, true)).limit(1);
  return s ?? { id: '', title: 'default', updatedAt: new Date(), isDefault: true, ...DEFAULT_SCHEME };
}

export async function schemeForOffering(offeringId: string): Promise<SchemeRow> {
  const [row] = await db
    .select({ s: gradeSchemes })
    .from(offerings)
    .innerJoin(gradeSchemes, eq(gradeSchemes.id, offerings.gradeSchemeId))
    .where(eq(offerings.id, offeringId));
  return row?.s ?? defaultScheme();
}

/** Состояние блоков урока для студента: видео, тесты, задания */
export async function blockStates(studentId: string, blockIds: string[]) {
  const video = new Map<string, { percent: number; lastPosition: number }>();
  const quizDone = new Map<string, number | null>();
  const submitted = new Map<string, { score: number | null; isLate: boolean }>();
  if (blockIds.length === 0) return { video, quizDone, submitted };
  const [v, q, s] = await Promise.all([
    db
      .select({ blockId: videoProgress.blockId, percent: videoProgress.percent, last: videoProgress.lastPosition })
      .from(videoProgress)
      .where(and(eq(videoProgress.studentId, studentId), inArray(videoProgress.blockId, blockIds))),
    db
      .select({ blockId: quizzes.blockId, best: sql<number | null>`max(${quizAttempts.score})` })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(and(eq(quizAttempts.studentId, studentId), inArray(quizzes.blockId, blockIds), isNotNull(quizAttempts.finishedAt)))
      .groupBy(quizzes.blockId),
    db
      .select({ blockId: assignments.blockId, score: submissions.score, isLate: submissions.isLate })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .where(and(eq(submissions.studentId, studentId), inArray(assignments.blockId, blockIds))),
  ]);
  v.forEach((r) => video.set(r.blockId, { percent: r.percent, lastPosition: r.last }));
  q.forEach((r) => quizDone.set(r.blockId, r.best));
  s.forEach((r) => submitted.set(r.blockId, { score: r.score, isLate: r.isLate }));
  return { video, quizDone, submitted };
}

export function blockDone(
  b: { id: string; type: string },
  st: Awaited<ReturnType<typeof blockStates>>,
  videoThreshold: number,
  visited: boolean,
) {
  if (b.type === 'video') return (st.video.get(b.id)?.percent ?? 0) >= videoThreshold;
  if (b.type === 'quiz') return st.quizDone.has(b.id);
  if (b.type === 'assignment') return st.submitted.has(b.id);
  return visited;
}

/**
 * Пересчёт урока: засчитан, когда выполнены все обязательные блоки
 * (видео ≥ порога, тест сдан, задание отправлено; текст и файлы — при открытии).
 */
export async function recomputeLesson(studentId: string, offeringId: string, lesson: SnapLesson, videoThreshold: number) {
  const st = await blockStates(
    studentId,
    lesson.blocks.map((b) => b.id),
  );
  const done = lesson.blocks.filter((b) => b.required).every((b) => blockDone(b, st, videoThreshold, true));
  const now = new Date();
  await db
    .insert(lessonProgress)
    .values({ studentId, offeringId, lessonId: lesson.id, status: done ? 'completed' : 'in_progress', completedAt: done ? now : null, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [lessonProgress.studentId, lessonProgress.offeringId, lessonProgress.lessonId],
      set: done
        ? { status: 'completed', completedAt: sql`coalesce(${lessonProgress.completedAt}, now())`, lastSeenAt: now }
        : { lastSeenAt: now },
    });
  return done;
}

/** Прогресс студента по курсу (по урокам) */
export async function studentCourseProgress(studentId: string, snap: CourseSnapshot) {
  const all = flattenLessons(snap);
  const ids = all.map((l) => l.id);
  const rows = ids.length
    ? await db
        .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status, lastSeenAt: lessonProgress.lastSeenAt })
        .from(lessonProgress)
        .where(and(eq(lessonProgress.studentId, studentId), inArray(lessonProgress.lessonId, ids)))
        .orderBy(desc(lessonProgress.lastSeenAt))
    : [];
  const completed = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.lessonId));
  const seen = new Set(rows.map((r) => r.lessonId));
  // «Продолжить»: последний открытый незавершённый урок, иначе первый непройденный
  const lastOpen = rows.find((r) => r.status !== 'completed')?.lessonId;
  const firstUndone = all.find((l) => !completed.has(l.id))?.id;
  return {
    total: all.length,
    completed: completed.size,
    percent: all.length ? Math.round((completed.size / all.length) * 100) : 0,
    completedIds: completed,
    seenIds: seen,
    continueLessonId: lastOpen ?? firstUndone ?? all[0]?.id ?? null,
    lastSeenAt: rows[0]?.lastSeenAt ?? null,
  };
}

/** Сколько уроков из списка прошёл каждый студент (для журналов и дашбордов) */
export async function completedCounts(studentIds: string[], lessonIds: string[]) {
  const out = new Map<string, number>();
  if (!studentIds.length || !lessonIds.length) return out;
  for (const part of chunk(studentIds, 2000)) {
    const rows = await db
      .select({ s: lessonProgress.studentId, n: sql<number>`count(distinct ${lessonProgress.lessonId})::int` })
      .from(lessonProgress)
      .where(and(inArray(lessonProgress.studentId, part), inArray(lessonProgress.lessonId, lessonIds), eq(lessonProgress.status, 'completed')))
      .groupBy(lessonProgress.studentId);
    rows.forEach((r) => out.set(r.s, r.n));
  }
  return out;
}
