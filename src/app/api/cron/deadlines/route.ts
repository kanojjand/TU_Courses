import { NextResponse } from 'next/server';
import { notifyUpcomingDeadlines } from '@/server/maintenance/deadlines';

/**
 * F-S-10. Уведомления о приближающихся сроках сдачи.
 *
 * На тарифе Hobby вызывается из объединённой задачи /api/cron/daily.
 * На Pro может быть подключён отдельным расписанием.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(await notifyUpcomingDeadlines());
}
