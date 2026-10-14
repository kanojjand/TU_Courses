import 'server-only';
import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { assignments, enrollments, gradeItems, grades, lessonBlocks, mediaAssets, notifications, quizAttempts, quizzes, sessions, submissions } from '@/db/schema';
import { bunnyConfig, getBunnyVideo, mapBunnyStatus } from '@/lib/bunny';
import { notify } from '@/lib/notify';
import { finishAttemptInternal } from '@/lib/quiz-attempt';

/**
 * Фоновые задачи. Одни и те же функции запускаются:
 *  - на бесплатном стенде — по расписанию Vercel (/api/cron/daily);
 *  - на своём сервере — процессом pg-boss (scripts/worker.ts), чаще.
 */

/** Напоминание о сроке за двое суток: тем, кто ещё не сдал */
export async function deadlineReminders() {
  const now = new Date();
  const soon = new Date(Date.now() + 48 * 3600_000);
  const items = await db
    .select({ item: gradeItems, blockType: lessonBlocks.type, lessonId: lessonBlocks.lessonId })
    .from(gradeItems)
    .innerJoin(lessonBlocks, eq(lessonBlocks.id, gradeItems.blockId))
    .where(and(gte(gradeItems.dueAt, now), lt(gradeItems.dueAt, soon)));
  let sent = 0;
  for (const { item, blockType, lessonId } of items) {
    const studs = await db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.offeringId, item.offeringId), eq(enrollments.status, 'active')));
    const ids = studs.map((s) => s.id);
    if (!ids.length) continue;
    const done = new Set<string>();
    (await db.select({ s: grades.studentId }).from(grades).where(and(eq(grades.gradeItemId, item.id), inArray(grades.studentId, ids)))).forEach((r) => done.add(r.s));
    if (blockType === 'quiz') {
      (
        await db
          .select({ s: quizAttempts.studentId })
          .from(quizAttempts)
          .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
          .where(and(eq(quizzes.blockId, item.blockId!), isNotNull(quizAttempts.finishedAt), inArray(quizAttempts.studentId, ids)))
      ).forEach((r) => done.add(r.s));
    } else if (blockType === 'assignment') {
      (
        await db
          .select({ s: submissions.studentId })
          .from(submissions)
          .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
          .where(and(eq(assignments.blockId, item.blockId!), inArray(submissions.studentId, ids)))
      ).forEach((r) => done.add(r.s));
    }
    const link = `/learn/${item.offeringId}/${lessonId}`;
    // Не напоминаем повторно, если уже напомнили об этом элементе
    const already = new Set(
      (
        await db
          .select({ u: notifications.userId })
          .from(notifications)
          .where(and(eq(notifications.type, 'deadlineSoon'), eq(notifications.link, link), sql`${notifications.params}->>'item' = ${item.title}`))
      ).map((r) => r.u),
    );
    const targets = ids.filter((id) => !done.has(id) && !already.has(id));
    const date = item.dueAt!.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Almaty' });
    await notify(targets, 'deadlineSoon', { item: item.title, date }, link);
    sent += targets.length;
  }
  return { reminders: sent };
}

/** Закрыть попытки тестов, у которых вышло время (если студент закрыл вкладку) */
export async function closeExpiredAttempts() {
  const expired = await db
    .select({ id: quizAttempts.id, s: quizAttempts.studentId })
    .from(quizAttempts)
    .where(and(isNull(quizAttempts.finishedAt), lt(quizAttempts.deadlineAt, new Date(Date.now() - 60_000))))
    .limit(2000);
  for (const a of expired) await finishAttemptInternal(a.id, a.s);
  return { closedAttempts: expired.length };
}

/** Сверка статусов видео с Bunny на случай потерянного вебхука */
export async function refreshVideos() {
  const cfg = await bunnyConfig();
  if (!cfg) return { videos: 0 };
  const stale = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.provider, 'bunny'), inArray(mediaAssets.status, ['uploading', 'processing']), lt(mediaAssets.updatedAt, new Date(Date.now() - 10 * 60_000))))
    .limit(200);
  let n = 0;
  for (const m of stale) {
    try {
      const v = await getBunnyVideo(cfg, m.bunnyVideoId!);
      const status = mapBunnyStatus(v.status);
      await db.update(mediaAssets).set({ status, durationSec: v.length || m.durationSec, updatedAt: new Date() }).where(eq(mediaAssets.id, m.id));
      n++;
    } catch {
      // Видео удалено в Bunny или сеть недоступна — попробуем позже
    }
  }
  return { videos: n };
}

/** Разделы цифрового следа на три месяца вперёд и уборка просроченных сессий */
export async function housekeeping() {
  await db.execute(sql`select lms.ensure_activity_partition((date_trunc('month', now()) + make_interval(months => m))::date) from generate_series(0, 3) as m`);
  const del = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return { expiredSessions: del.length };
}

export const JOBS = {
  daily: async () => ({ ...(await deadlineReminders()), ...(await closeExpiredAttempts()), ...(await refreshVideos()), ...(await housekeeping()) }),
  frequent: async () => ({ ...(await closeExpiredAttempts()), ...(await refreshVideos()) }),
  reminders: deadlineReminders,
} as const;

export type JobName = keyof typeof JOBS;
