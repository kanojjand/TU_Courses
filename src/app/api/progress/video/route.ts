import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { courses, enrollments, lessonBlocks, lessons, mediaAssets, modules, offerings, videoProgress } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { flattenLessons, offeringSnapshot } from '@/lib/course';
import { recomputeLesson, schemeForOffering } from '@/lib/progress';
import { mergeSegments, plausibleIncoming, watchedPercent, type Segment } from '@/lib/rules/video';
import { isUuid } from '@/lib/utils';

/**
 * Отметки просмотра видео: плеер шлёт их раз в 10–15 секунд (раздел 7 ТЗ).
 * Сервер склеивает отрезки без двойного счёта и засчитывает урок при ≥ порога.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { blockId?: string; offeringId?: string; segments?: unknown; position?: number; duration?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { blockId, offeringId } = body;
  if (!isUuid(blockId) || !isUuid(offeringId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const incoming = (Array.isArray(body.segments) ? body.segments : [])
    .filter((s): s is [number, number] => Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === 'number' && Number.isFinite(x)))
    .slice(0, 50) as Segment[];

  // Студент записан на поток, блок есть в курсе потока (живая таблица или опубликованный снимок)
  const [enr] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.offeringId, offeringId), eq(enrollments.studentId, user.id), eq(enrollments.status, 'active')));
  if (!enr) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [row] = await db
    .select({ data: lessonBlocks.data })
    .from(lessonBlocks)
    .innerJoin(lessons, eq(lessons.id, lessonBlocks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .innerJoin(offerings, eq(offerings.courseId, courses.id))
    .where(and(eq(lessonBlocks.id, blockId), eq(offerings.id, offeringId)));
  let mediaId: string | null = (row?.data as { mediaId?: string } | undefined)?.mediaId ?? null;
  if (!row) {
    const snap = await offeringSnapshot(offeringId);
    const block = snap && flattenLessons(snap.snap).flatMap((l) => l.blocks).find((b) => b.id === blockId);
    if (!block || block.type !== 'video') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mediaId = block.data.mediaId ?? null;
  }
  let duration = typeof body.duration === 'number' && body.duration > 0 && body.duration < 6 * 3600 ? body.duration : null;
  if (mediaId) {
    const [m] = await db.select({ d: mediaAssets.durationSec }).from(mediaAssets).where(eq(mediaAssets.id, mediaId));
    if (m?.d) duration = m.d;
  }

  const [prev] = await db.select().from(videoProgress).where(and(eq(videoProgress.studentId, user.id), eq(videoProgress.blockId, blockId)));
  const elapsed = prev ? (Date.now() - prev.updatedAt.getTime()) / 1000 : 60;
  const accepted = plausibleIncoming(incoming, elapsed);
  const segments = mergeSegments(prev?.segments ?? [], accepted, duration);
  const percent = watchedPercent(segments, duration);
  const position = typeof body.position === 'number' && body.position >= 0 ? body.position : (prev?.lastPosition ?? 0);
  await db
    .insert(videoProgress)
    .values({ studentId: user.id, blockId, mediaId, segments, durationSec: duration ? Math.round(duration) : null, percent, lastPosition: position })
    .onConflictDoUpdate({
      target: [videoProgress.studentId, videoProgress.blockId],
      set: { segments, durationSec: duration ? Math.round(duration) : null, percent, lastPosition: position, updatedAt: new Date() },
    });

  let lessonDone = false;
  const scheme = await schemeForOffering(offeringId);
  if (percent >= scheme.videoThreshold && (prev?.percent ?? 0) < scheme.videoThreshold) {
    const snap = await offeringSnapshot(offeringId);
    const lesson = snap && flattenLessons(snap.snap).find((l) => l.blocks.some((b) => b.id === blockId));
    if (lesson) lessonDone = await recomputeLesson(user.id, offeringId, lesson, scheme.videoThreshold);
  }
  return NextResponse.json({ percent, lessonDone, threshold: scheme.videoThreshold });
}
