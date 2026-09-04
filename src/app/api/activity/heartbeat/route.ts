import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/server/guards';
import { closeTimeSession, heartbeat, openTimeSession } from '@/server/progress';

/**
 * Сигнал активности — раздел 4.2 ТЗ.
 * Клиент отправляет запрос раз в 30 секунд при наличии взаимодействия
 * со страницей. Неактивное время не засчитывается.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['open', 'beat', 'close']),
  contentItemId: z.string().optional(),
  sessionId: z.string().optional(),
  videoWatchedPercent: z.number().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await request.json());

    if (body.action === 'open') {
      if (!body.contentItemId) {
        return NextResponse.json({ error: 'contentItemId обязателен' }, { status: 400 });
      }
      const sessionId = await openTimeSession(user.id, body.contentItemId);
      return NextResponse.json({ sessionId });
    }

    if (body.action === 'close') {
      if (body.sessionId) await closeTimeSession(body.sessionId);
      return NextResponse.json({ ok: true });
    }

    if (!body.sessionId) {
      return NextResponse.json({ error: 'sessionId обязателен' }, { status: 400 });
    }

    const result = await heartbeat({
      sessionId: body.sessionId,
      userId: user.id,
      videoWatchedPercent: body.videoWatchedPercent,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
