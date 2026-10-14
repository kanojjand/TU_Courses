'use client';

import * as tus from 'tus-js-client';
import { attachMediaToBlock, markUploaded, prepareVideoUpload } from '@/server/video-actions';

type Prepared = { mediaId: string; tus: { endpoint: string; headers: Record<string, string> }; at: number };

const keyOf = (courseId: string, f: File) => `tu-video:${courseId}:${f.name}:${f.size}:${f.lastModified}`;

function loadPrepared(key: string): Prepared | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Prepared;
    // Подпись Bunny живёт сутки — берём с запасом
    return Date.now() - p.at < 20 * 3600_000 ? p : null;
  } catch {
    return null;
  }
}

/**
 * Загрузка ролика в Bunny по протоколу tus прямо из браузера.
 * Если загрузка оборвалась (сеть, закрыли вкладку), тот же файл
 * продолжится с места остановки в то же видео Bunny.
 */
export async function uploadVideo(opts: {
  courseId: string;
  file: File;
  blockId?: string | null;
  onProgress?: (percent: number) => void;
}): Promise<{ mediaId: string } | { error: string }> {
  const key = keyOf(opts.courseId, opts.file);
  let prep = loadPrepared(key);
  if (prep) {
    if (opts.blockId) await attachMediaToBlock(opts.blockId, prep.mediaId);
  } else {
    const res = await prepareVideoUpload(opts.courseId, opts.file.name, opts.blockId ?? null);
    if ('error' in res && res.error) return { error: res.error };
    prep = { mediaId: res.mediaId as string, tus: res.tus as Prepared['tus'], at: Date.now() };
    try {
      localStorage.setItem(key, JSON.stringify(prep));
    } catch {
      // Без localStorage просто не будет докачки после перезагрузки
    }
  }
  const p = prep;
  return new Promise((resolve) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: p.tus.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
      chunkSize: 50 * 1024 * 1024,
      headers: p.tus.headers,
      metadata: { filetype: opts.file.type || 'video/mp4', title: opts.file.name },
      onProgress: (sent, total) => opts.onProgress?.(Math.round((sent / total) * 100)),
      onError: async (err) => {
        await markUploaded(p.mediaId, false, String(err));
        resolve({ error: String(err) });
      },
      onSuccess: async () => {
        try {
          localStorage.removeItem(key);
        } catch {}
        await markUploaded(p.mediaId, true);
        resolve({ mediaId: p.mediaId });
      },
    });
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
