import { NextResponse } from 'next/server';

import { processOutbox } from '@/integration/platonus/outbox';
import { closeStaleSessions } from '@/server/progress';
import { notifyUpcomingDeadlines } from '@/server/maintenance/deadlines';
import { checkQuotas } from '@/server/maintenance/quotas';

/**
 * Ежедневное обслуживание — одна задача вместо трёх.
 *
 * ПОЧЕМУ ОБЪЕДИНЕНО. Бесплатный тариф Vercel Hobby допускает не более
 * двух cron-задач, и каждая может запускаться не чаще раза в сутки.
 * Поэтому расписание по умолчанию — одна ежедневная задача, выполняющая
 * все регламентные операции последовательно.
 *
 * НА ТАРИФЕ PRO замените в `vercel.json` этот маршрут тремя отдельными
 * с их собственными расписаниями (см. комментарий в `docs/DEPLOY.md`):
 *   /api/cron/outbox        каждые 10 минут
 *   /api/cron/deadlines     ежедневно в 06:00
 *   /api/cron/backup-check  ежедневно в 03:00
 *
 * Отдельные маршруты сохранены — они работают и вызываются вручную.
 *
 * Отказ одной операции не отменяет остальные: каждая выполняется
 * независимо, результат по каждой возвращается отдельно.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type StepResult = { ok: true; data: unknown } | { ok: false; error: string };

async function step<T>(name: string, fn: () => Promise<T>): Promise<[string, StepResult]> {
  try {
    return [name, { ok: true, data: await fn() }];
  } catch (error) {
    return [
      name,
      { ok: false, error: error instanceof Error ? error.message : String(error) },
    ];
  }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();

  const results = await Promise.all([
    // Очередь исходящих событий Platonus (раздел 9.1 ТЗ)
    step('outbox', () => processOutbox()),
    // Закрытие повисших сессий учёта времени (раздел 4.2)
    step('staleSessions', () => closeStaleSessions()),
    // Уведомления о приближающихся сроках сдачи (F-S-10)
    step('deadlines', () => notifyUpcomingDeadlines()),
    // Контроль объёма БД и квот (раздел 6.2, риск исчерпания квот)
    step('quotas', () => checkQuotas()),
  ]);

  const report = Object.fromEntries(results);
  const failed = results.filter(([, r]) => !r.ok).map(([name]) => name);

  return NextResponse.json({
    ok: failed.length === 0,
    failed,
    durationMs: Date.now() - started,
    at: new Date().toISOString(),
    ...report,
  });
}
