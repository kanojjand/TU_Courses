'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { courseAuthors, courses, lessonBlocks, lessons, mediaAssets, modules } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { bunnyConfig, createBunnyVideo, getBunnyVideo, mapBunnyStatus, tusCredentials } from '@/lib/bunny';
import { courseAccess } from '@/lib/course';
import { isUuid } from '@/lib/utils';

export async function bunnyEnabled() {
  return !!(await bunnyConfig());
}

/**
 * Готовим загрузку ролика: создаём видео в Bunny и выдаём браузеру подпись tus.
 * Сам файл идёт из браузера прямо в Bunny, с докачкой при обрыве.
 */
export async function prepareVideoUpload(courseId: string, filename: string, blockId: string | null) {
  const user = await requireUser();
  if (!isUuid(courseId)) throw new Error('BAD_REQUEST');
  const acc = await courseAccess(user, courseId);
  if (!acc.canEdit || !acc.course) throw new Error('FORBIDDEN');
  const cfg = await bunnyConfig();
  if (!cfg) return { error: 'noBunny' as const };
  const title = `${acc.course.title} — ${filename}`.slice(0, 200);
  const videoId = await createBunnyVideo(cfg, title);
  const [m] = await db
    .insert(mediaAssets)
    .values({ provider: 'bunny', bunnyVideoId: videoId, filename, status: 'uploading', ownerId: user.id, courseId })
    .returning();
  if (blockId && isUuid(blockId)) {
    const [b] = await db
      .select({ block: lessonBlocks, courseId: modules.courseId })
      .from(lessonBlocks)
      .innerJoin(lessons, eq(lessons.id, lessonBlocks.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .where(eq(lessonBlocks.id, blockId));
    if (b && b.courseId === courseId) await db.update(lessonBlocks).set({ data: { ...b.block.data, mediaId: m.id } }).where(eq(lessonBlocks.id, blockId));
  }
  return { mediaId: m.id, tus: tusCredentials(cfg, videoId) };
}

/** Браузер закончил отправку — дальше Bunny перекодирует, статус придёт вебхуком */
export async function markUploaded(mediaId: string, ok: boolean, error?: string) {
  const user = await requireUser();
  if (!isUuid(mediaId)) return;
  await db
    .update(mediaAssets)
    .set({ status: ok ? 'processing' : 'error', error: ok ? null : (error ?? 'upload failed').slice(0, 500), updatedAt: new Date() })
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.ownerId, user.id)));
}

/** Сверка статусов с Bunny (на случай, если вебхук не дошёл) */
export async function refreshMediaStatuses(courseId?: string) {
  const user = await requireUser();
  const cfg = await bunnyConfig();
  if (!cfg) return { updated: 0 };
  const mine = await db.select({ c: courseAuthors.courseId }).from(courseAuthors).where(eq(courseAuthors.userId, user.id));
  const courseIds = courseId ? [courseId] : mine.map((m) => m.c);
  if (!courseIds.length) return { updated: 0 };
  const list = await db
    .select()
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.courseId, courseIds), eq(mediaAssets.provider, 'bunny'), inArray(mediaAssets.status, ['uploading', 'processing'])));
  let updated = 0;
  for (const m of list.slice(0, 50)) {
    try {
      const v = await getBunnyVideo(cfg, m.bunnyVideoId!);
      const status = mapBunnyStatus(v.status);
      if (status !== m.status || (v.length && v.length !== m.durationSec)) {
        await db.update(mediaAssets).set({ status, durationSec: v.length || m.durationSec, updatedAt: new Date() }).where(eq(mediaAssets.id, m.id));
        updated++;
      }
    } catch {
      // Пропускаем недоступные записи
    }
  }
  revalidatePath('/studio/videos');
  return { updated };
}

export async function courseTitle(courseId: string) {
  const [c] = await db.select({ t: courses.title }).from(courses).where(eq(courses.id, courseId));
  return c?.t ?? '';
}

/** Привязать уже загружаемое видео к блоку (при докачке после перезагрузки страницы) */
export async function attachMediaToBlock(blockId: string, mediaId: string) {
  const user = await requireUser();
  if (!isUuid(blockId) || !isUuid(mediaId)) return;
  const [b] = await db
    .select({ block: lessonBlocks, courseId: modules.courseId })
    .from(lessonBlocks)
    .innerJoin(lessons, eq(lessons.id, lessonBlocks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(lessonBlocks.id, blockId));
  if (!b) return;
  const acc = await courseAccess(user, b.courseId);
  const [m] = await db.select({ c: mediaAssets.courseId }).from(mediaAssets).where(eq(mediaAssets.id, mediaId));
  if (!acc.canEdit || m?.c !== b.courseId) return;
  await db.update(lessonBlocks).set({ data: { ...b.block.data, mediaId } }).where(eq(lessonBlocks.id, blockId));
}
