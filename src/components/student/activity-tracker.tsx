'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { fmtMinutes } from '@/lib/utils';

/**
 * Учёт фактической активности — раздел 4.2, п. 2 ТЗ.
 *
 *  — сигнал раз в 30 секунд, но только при наличии взаимодействия со страницей;
 *  — при отсутствии взаимодействия дольше порога сигналы прекращаются,
 *    и сервер закрывает сессию, не засчитывая неактивное время;
 *  — при уходе со страницы сессия закрывается явно.
 */
export function ActivityTracker({
  contentItemId,
  heartbeatIntervalSec,
  idleTimeoutMin,
  initiallyCompleted,
}: {
  contentItemId: string;
  heartbeatIntervalSec: number;
  idleTimeoutMin: number;
  initiallyCompleted: boolean;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [completed, setCompleted] = useState(initiallyCompleted);
  const sessionId = useRef<string | null>(null);
  const lastInteraction = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function touch() {
      lastInteraction.current = Date.now();
    }

    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'keydown',
      'scroll',
      'click',
      'touchstart',
      'wheel',
    ];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    async function post(body: Record<string, unknown>) {
      const res = await fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      return res.json();
    }

    async function open() {
      const data = await post({ action: 'open', contentItemId });
      if (cancelled || !data?.sessionId) return;
      sessionId.current = data.sessionId;

      timer = setInterval(async () => {
        if (!sessionId.current || document.hidden) return;
        // Взаимодействия не было дольше порога — сигнал не отправляется
        if (Date.now() - lastInteraction.current > idleTimeoutMin * 60_000) return;

        const result = await post({ action: 'beat', sessionId: sessionId.current });
        if (!result || cancelled) return;
        setMinutes(result.countedMinutes ?? null);
        if (result.completed) setCompleted(true);
      }, heartbeatIntervalSec * 1000);
    }

    void open();

    function close() {
      if (!sessionId.current) return;
      const payload = JSON.stringify({ action: 'close', sessionId: sessionId.current });
      // sendBeacon доставляет запрос даже при закрытии вкладки
      navigator.sendBeacon?.(
        '/api/activity/heartbeat',
        new Blob([payload], { type: 'application/json' })
      );
    }

    window.addEventListener('pagehide', close);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [contentItemId, heartbeatIntervalSec, idleTimeoutMin]);

  if (minutes === null && !completed) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-fg-muted">
      {completed && (
        <span className="flex items-center gap-1.5 font-medium text-success">
          <CheckCircle2 size={14} aria-hidden /> Элемент завершён
        </span>
      )}
      {minutes !== null && <span>Засчитано времени: {fmtMinutes(minutes)}</span>}
    </div>
  );
}
