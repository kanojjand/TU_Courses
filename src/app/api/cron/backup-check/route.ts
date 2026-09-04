import { NextResponse } from 'next/server';
import { checkQuotas } from '@/server/maintenance/quotas';

/**
 * Раздел 6.2 ТЗ: контроль потребления квот с оповещением при 70 %.
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

  return NextResponse.json({ ...(await checkQuotas()), checkedAt: new Date().toISOString() });
}
