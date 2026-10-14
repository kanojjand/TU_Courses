import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { courseAuthors, mediaAssets } from '@/db/schema';
import { bunnyConfig, getBunnyVideo, mapBunnyStatus } from '@/lib/bunny';
import { notify } from '@/lib/notify';

/**
 * Вебхук Bunny Stream о смене статуса видео. Содержимому запроса не доверяем:
 * берём только id видео и перепроверяем статус через API Bunny.
 */
export async function POST(req: Request) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET;
  if (secret && new URL(req.url).searchParams.get('secret') !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { VideoGuid?: string } | null;
  const guid = body?.VideoGuid;
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) return NextResponse.json({ ok: false }, { status: 400 });
  const cfg = await bunnyConfig();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 503 });
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.bunnyVideoId, guid));
  if (!m) return NextResponse.json({ ok: true, ignored: true });
  const v = await getBunnyVideo(cfg, guid);
  const status = mapBunnyStatus(v.status);
  await db.update(mediaAssets).set({ status, durationSec: v.length || m.durationSec, updatedAt: new Date() }).where(eq(mediaAssets.id, m.id));
  if (status !== m.status && (status === 'ready' || status === 'error') && m.courseId) {
    const authors = await db.select({ u: courseAuthors.userId }).from(courseAuthors).where(eq(courseAuthors.courseId, m.courseId));
    await notify(authors.map((a) => a.u), status === 'ready' ? 'videoReady' : 'videoFailed', { file: m.filename ?? '' }, '/studio/videos');
  }
  return NextResponse.json({ ok: true });
}
