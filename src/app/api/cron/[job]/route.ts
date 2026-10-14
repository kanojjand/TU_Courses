import { NextResponse } from 'next/server';
import { JOBS, type JobName } from '@/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Запуск фоновой задачи по расписанию Vercel. Vercel сам передаёт
 * заголовок Authorization: Bearer <CRON_SECRET>, если переменная задана.
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(job in JOBS)) return NextResponse.json({ error: 'unknown job' }, { status: 404 });
  const started = Date.now();
  const result = await JOBS[job as JobName]();
  return NextResponse.json({ ok: true, job, ms: Date.now() - started, ...result });
}
