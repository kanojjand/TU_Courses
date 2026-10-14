import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { offerings, submissions } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { getFileMeta, readFileBody } from '@/lib/storage';
import { isUuid } from '@/lib/utils';

/**
 * Скачивание файла. Материалы курса доступны любому вошедшему пользователю,
 * работы студентов — самому студенту, преподавателю потока и офисам.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const meta = await getFileMeta(id);
  if (!meta) return new NextResponse('Not found', { status: 404 });

  const subs = await db
    .select({ studentId: submissions.studentId, teacherId: offerings.teacherId })
    .from(submissions)
    .innerJoin(offerings, eq(offerings.id, submissions.offeringId))
    .where(and(sql`${submissions.fileIds} @> ${JSON.stringify([id])}::jsonb`));
  if (subs.length) {
    const privileged = user.roles.some((r) => ['admin', 'registrar', 'academic_office', 'dept_head', 'dean'].includes(r.role));
    const allowed = privileged || meta.ownerId === user.id || subs.some((s) => s.studentId === user.id || s.teacherId === user.id);
    if (!allowed) return new NextResponse('Forbidden', { status: 403 });
  }

  const body = await readFileBody(meta);
  if (!body) return new NextResponse('Not found', { status: 404 });
  const download = new URL(req.url).searchParams.has('download');
  const inline = !download && /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/.test(meta.mime);
  return new NextResponse(body, {
    headers: {
      'Content-Type': meta.mime,
      'Content-Length': String(meta.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
