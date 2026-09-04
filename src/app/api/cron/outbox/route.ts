import { NextResponse } from 'next/server';
import { processOutbox } from '@/integration/platonus/outbox';
import { closeStaleSessions } from '@/server/progress';

/**
 * Обработка очереди исходящих событий интеграции (раздел 9.1) и закрытие
 * повисших сессий учёта времени. Запускается Vercel Cron каждые 10 минут.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [outbox, closedSessions] = await Promise.all([processOutbox(), closeStaleSessions()]);

  return NextResponse.json({ outbox, closedSessions, at: new Date().toISOString() });
}
