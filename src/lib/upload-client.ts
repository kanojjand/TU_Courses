'use client';

export type Uploaded = { id: string; filename: string; size: number; mime: string };

/** Загрузка файла на сервер с прогрессом (XHR — у fetch нет прогресса отправки) */
export function uploadFile(file: File, opts: { prefix?: string; onProgress?: (p: number) => void } = {}): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (opts.prefix) form.append('prefix', opts.prefix);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data as Uploaded);
        else reject(new Error(data.error ?? `HTTP ${xhr.status}`));
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(form);
  });
}

/** Предел тела запроса: на Vercel — 4,5 МБ, на своём сервере задаётся NEXT_PUBLIC_MAX_UPLOAD_MB */
export const MAX_UPLOAD_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 4) * 1024 * 1024;
