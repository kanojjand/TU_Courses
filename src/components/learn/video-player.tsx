'use client';

import { CheckCircle2, Loader2, VideoOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import type { VideoSource } from '@/lib/lesson';

type Seg = [number, number];

declare global {
  interface Window {
    playerjs?: { Player: new (el: HTMLIFrameElement) => PlayerJs };
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YtPlayer; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}
type PlayerJs = { on: (ev: string, cb: (d?: { seconds: number; duration: number }) => void) => void; setCurrentTime: (s: number) => void };
type YtPlayer = { getCurrentTime: () => number; getDuration: () => number; getPlayerState: () => number; seekTo: (s: number, a: boolean) => void };

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script'));
    document.head.appendChild(s);
  });
}

/**
 * Плеер урока с учётом просмотра. Готовый плеер видеосервиса (Bunny),
 * YouTube или mp4 — всё равно: компонент раз в секунду смотрит позицию,
 * собирает просмотренные отрезки и раз в 12 секунд отправляет их на сервер.
 * Перемотка вперёд не засчитывается. Поверх видео — водяной знак студента.
 */
export function VideoPlayer({
  blockId,
  offeringId,
  source,
  watermark,
  initialPercent,
  lastPosition,
  threshold,
  title,
}: {
  blockId: string;
  offeringId: string;
  source: VideoSource;
  watermark: string;
  initialPercent: number;
  lastPosition: number;
  threshold: number;
  title: string;
}) {
  const t = useTranslations('learn.video');
  const router = useRouter();
  const [percent, setPercent] = useState(initialPercent);
  const pending = useRef<Seg[]>([]);
  const current = useRef<Seg | null>(null);
  const lastT = useRef<number | null>(null);
  const duration = useRef<number | null>(null);
  const position = useRef<number>(lastPosition);
  const doneRef = useRef(initialPercent >= threshold);
  const [wmPos, setWmPos] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<HTMLDivElement>(null);

  /** Наблюдение позиции: непрерывное воспроизведение продлевает отрезок, скачок — начинает новый */
  const observe = useCallback((time: number, playing: boolean) => {
    position.current = time;
    if (!playing) {
      if (current.current) pending.current.push(current.current);
      current.current = null;
      lastT.current = null;
      return;
    }
    const prev = lastT.current;
    if (prev !== null && time - prev >= 0 && time - prev <= 3.5) {
      if (!current.current) current.current = [prev, time];
      else current.current[1] = time;
    } else {
      if (current.current) pending.current.push(current.current);
      current.current = null;
    }
    lastT.current = time;
  }, []);

  const flush = useCallback(
    async (beacon = false) => {
      const segs = [...pending.current];
      if (current.current) segs.push([current.current[0], current.current[1]]);
      pending.current = [];
      if (current.current) current.current = [current.current[1], current.current[1]];
      const useful = segs.filter(([a, b]) => b - a >= 0.5);
      if (!useful.length && !beacon) return;
      const payload = JSON.stringify({ blockId, offeringId, segments: useful, position: position.current, duration: duration.current });
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/progress/video', new Blob([payload], { type: 'application/json' }));
        return;
      }
      try {
        const res = await fetch('/api/progress/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
        if (!res.ok) return;
        const data = (await res.json()) as { percent: number; lessonDone: boolean };
        setPercent((p) => Math.max(p, data.percent));
        if (data.percent >= threshold && !doneRef.current) {
          doneRef.current = true;
          router.refresh();
        }
      } catch {
        // Нет сети — вернём отрезки в очередь
        pending.current.unshift(...useful);
      }
    },
    [blockId, offeringId, threshold, router],
  );

  useEffect(() => {
    const id = setInterval(() => void flush(), 12_000);
    const onHide = () => document.visibilityState === 'hidden' && void flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void flush(true);
    };
  }, [flush]);

  // Водяной знак переезжает каждые 20 секунд
  useEffect(() => {
    const id = setInterval(() => setWmPos((p) => (p + 1) % 4), 20_000);
    return () => clearInterval(id);
  }, []);

  // Bunny: события плеера через player.js
  useEffect(() => {
    if (source.kind !== 'bunny' || !iframeRef.current) return;
    let alive = true;
    loadScript('https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js')
      .then(() => {
        if (!alive || !window.playerjs || !iframeRef.current) return;
        const player = new window.playerjs.Player(iframeRef.current);
        let playing = false;
        player.on('ready', () => {
          player.on('play', () => (playing = true));
          player.on('pause', () => {
            playing = false;
            observe(position.current, false);
            void flush();
          });
          player.on('ended', () => {
            playing = false;
            observe(position.current, false);
            void flush();
          });
          player.on('timeupdate', (d) => {
            if (!d) return;
            duration.current = d.duration || duration.current;
            observe(d.seconds, playing);
          });
          if (lastPosition > 5) player.setCurrentTime(lastPosition);
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [source.kind, observe, flush, lastPosition]);

  // YouTube: IFrame API и опрос позиции раз в секунду
  useEffect(() => {
    if (source.kind !== 'youtube' || !ytRef.current) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let alive = true;
    const create = () => {
      if (!alive || !window.YT || !ytRef.current) return;
      // YouTube заменяет элемент на iframe — даём ему свой узел, а не управляемый React
      const host = document.createElement('div');
      ytRef.current.replaceChildren(host);
      const player = new window.YT.Player(host, {
        videoId: source.videoId,
        playerVars: { rel: 0, modestbranding: 1, start: Math.floor(lastPosition > 5 ? lastPosition : 0) },
        events: {
          onReady: () => {
            timer = setInterval(() => {
              const playing = player.getPlayerState() === window.YT!.PlayerState.PLAYING;
              duration.current = player.getDuration() || duration.current;
              observe(player.getCurrentTime(), playing);
            }, 1000);
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        create();
      };
      void loadScript('https://www.youtube.com/iframe_api');
    }
    const container = ytRef.current;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      container?.replaceChildren();
    };
  }, [source, observe, lastPosition]);

  if (source.kind === 'pending') {
    const text = source.status === 'error' ? t('error') : source.status === 'missing' ? t('missing') : t('notReady');
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-surface-2 p-6 text-center text-fg-muted">
        {source.status === 'processing' || source.status === 'uploading' ? <Loader2 className="size-8 animate-spin" /> : <VideoOff className="size-8" />}
        <p className="text-sm">{text}</p>
      </div>
    );
  }

  const wmClass = ['top-3 left-3', 'top-3 right-3', 'bottom-14 right-3', 'bottom-14 left-3'][wmPos];
  return (
    <div>
      <div ref={containerRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {source.kind === 'bunny' && (
          <iframe
            ref={iframeRef}
            src={source.src}
            title={title}
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        {source.kind === 'youtube' && <div ref={ytRef} className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />}
        {source.kind === 'html5' && (
          <video
            ref={videoRef}
            src={source.src}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="absolute inset-0 h-full w-full"
            onLoadedMetadata={(e) => {
              duration.current = e.currentTarget.duration;
              if (lastPosition > 5 && lastPosition < e.currentTarget.duration - 3) e.currentTarget.currentTime = lastPosition;
            }}
            onTimeUpdate={(e) => observe(e.currentTarget.currentTime, !e.currentTarget.paused)}
            onPause={(e) => {
              observe(e.currentTarget.currentTime, false);
              void flush();
            }}
            onEnded={(e) => {
              observe(e.currentTarget.currentTime, false);
              void flush();
            }}
          />
        )}
        <span
          aria-hidden
          className={`pointer-events-none absolute ${wmClass} rounded bg-black/25 px-2 py-0.5 text-[0.7rem] font-medium text-white/55 select-none transition-all duration-700`}
        >
          {watermark}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Progress value={percent} className="max-w-48" tone={percent >= threshold ? 'success' : 'brand'} label={t('watched', { percent: Math.round(percent) })} />
        <span className={percent >= threshold ? 'inline-flex items-center gap-1 font-medium text-success' : 'text-fg-muted'}>
          {percent >= threshold && <CheckCircle2 className="size-4" />}
          {t('watched', { percent: Math.round(percent) })}
        </span>
        {percent < threshold && <span className="text-xs text-fg-muted">{t('needed', { percent: threshold })}</span>}
      </div>
    </div>
  );
}
