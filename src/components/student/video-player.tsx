'use client';

import { useEffect, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';

/**
 * F-S-06. Просмотр встроенного видео с учётом просмотренной доли.
 *
 * Раздел 4.2 ТЗ: для видео учёт ведётся по фактически просмотренной доле
 * через YouTube IFrame Player API, а не по времени нахождения на странице.
 */

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: Record<string, unknown>) => {
        getCurrentTime: () => number;
        getDuration: () => number;
        destroy: () => void;
      };
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function VideoPlayer({
  provider,
  videoId,
  contentItemId,
  completionThreshold,
}: {
  provider: 'youtube' | 'vimeo';
  videoId: string;
  contentItemId: string;
  completionThreshold: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const sessionId = useRef<string | null>(null);
  const maxWatched = useRef(0);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function openSession() {
      const res = await fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', contentItemId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) sessionId.current = data.sessionId;
    }
    void openSession();

    return () => {
      cancelled = true;
    };
  }, [contentItemId]);

  // Отправка просмотренной доли на сервер
  useEffect(() => {
    const timer = setInterval(() => {
      if (!sessionId.current || maxWatched.current === 0) return;
      void fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'beat',
          sessionId: sessionId.current,
          videoWatchedPercent: Math.min(100, maxWatched.current),
        }),
      });
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  // YouTube IFrame Player API — точный учёт просмотренной доли
  useEffect(() => {
    if (provider !== 'youtube' || !container.current) return;

    let player: { getCurrentTime: () => number; getDuration: () => number; destroy: () => void } | null =
      null;
    let poll: ReturnType<typeof setInterval> | null = null;

    function create() {
      if (!window.YT || !container.current) return;
      player = new window.YT.Player(container.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            poll = setInterval(() => {
              if (!player) return;
              const duration = player.getDuration();
              if (!duration) return;
              const pct = (player.getCurrentTime() / duration) * 100;
              // Учитывается максимальная достигнутая точка, а не текущая —
              // перемотка назад не сбрасывает результат
              if (pct > maxWatched.current) {
                maxWatched.current = pct;
                setPercent(pct);
              }
            }, 1000);
          },
        },
      });
    }

    if (window.YT?.Player) {
      create();
    } else {
      const existing = document.getElementById('yt-iframe-api');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'yt-iframe-api';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      window.onYouTubeIframeAPIReady = create;
    }

    return () => {
      if (poll) clearInterval(poll);
      player?.destroy?.();
    };
  }, [provider, videoId]);

  return (
    <div className="space-y-3">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        {provider === 'youtube' ? (
          <div ref={container} className="h-full w-full" />
        ) : (
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Видеоматериал"
          />
        )}
      </div>
      <Progress
        value={percent}
        tone={percent >= completionThreshold ? 'success' : 'brand'}
        label={`Просмотрено · для завершения требуется ${completionThreshold} %`}
      />
    </div>
  );
}
