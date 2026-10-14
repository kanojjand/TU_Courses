import 'server-only';
import { createHash } from 'node:crypto';
import { getSetting } from './settings';

/**
 * Bunny Stream (раздел 7 ТЗ): хранение, перекодирование, CDN и плеер.
 * Ключи берутся из переменных окружения или из «Админ → Интеграции».
 * Браузер грузит ролики напрямую в Bunny по протоколу tus — через сервер
 * LMS гигабайты не идут.
 */
export type BunnyConfig = { libraryId: string; apiKey: string; cdnHost: string; tokenKey: string };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function bunnyConfig(): Promise<BunnyConfig | null> {
  const stored = await getSetting<Partial<BunnyConfig>>('bunny', {});
  const cfg = {
    libraryId: process.env.BUNNY_LIBRARY_ID || stored.libraryId || '',
    apiKey: process.env.BUNNY_API_KEY || stored.apiKey || '',
    cdnHost: process.env.BUNNY_CDN_HOST || stored.cdnHost || '',
    tokenKey: process.env.BUNNY_TOKEN_KEY || stored.tokenKey || '',
  };
  return cfg.libraryId && cfg.apiKey ? cfg : null;
}

async function api<T>(cfg: BunnyConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://video.bunnycdn.com/library/${cfg.libraryId}${path}`, {
    ...init,
    headers: { AccessKey: cfg.apiKey, accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Bunny ${res.status}: ${await res.text().catch(() => '')}`);
  return (await res.json()) as T;
}

export async function createBunnyVideo(cfg: BunnyConfig, title: string) {
  const v = await api<{ guid: string }>(cfg, '/videos', { method: 'POST', body: JSON.stringify({ title }) });
  return v.guid;
}

/** Подпись для загрузки по tus прямо из браузера; ключ API в браузер не уходит */
export function tusCredentials(cfg: BunnyConfig, videoId: string, ttlSec = 24 * 3600) {
  const expire = Math.floor(Date.now() / 1000) + ttlSec;
  return {
    endpoint: 'https://video.bunnycdn.com/tusupload',
    headers: {
      AuthorizationSignature: sha256(cfg.libraryId + cfg.apiKey + expire + videoId),
      AuthorizationExpire: String(expire),
      VideoId: videoId,
      LibraryId: cfg.libraryId,
    },
  };
}

export type BunnyVideo = { guid: string; status: number; length: number; title: string; encodeProgress: number };

/** Статусы Bunny: 0 создано, 1 загружено, 2 обработка, 3 кодирование, 4 готово, 5 ошибка, 6 сбой загрузки */
export function mapBunnyStatus(status: number): 'uploading' | 'processing' | 'ready' | 'error' {
  if (status === 4) return 'ready';
  if (status === 5 || status === 6) return 'error';
  if (status === 0) return 'uploading';
  return 'processing';
}

export async function getBunnyVideo(cfg: BunnyConfig, videoId: string) {
  return api<BunnyVideo>(cfg, `/videos/${videoId}`);
}

export async function deleteBunnyVideo(cfg: BunnyConfig, videoId: string) {
  await api(cfg, `/videos/${videoId}`, { method: 'DELETE' });
}

/** Ссылка на встроенный плеер с подписью на короткий срок (Token Authentication) */
export function bunnyEmbedUrl(cfg: BunnyConfig, videoId: string, ttlSec = 6 * 3600) {
  const params = new URLSearchParams({ autoplay: 'false', preload: 'true', responsive: 'true', rememberPosition: 'true' });
  if (cfg.tokenKey) {
    const expires = Math.floor(Date.now() / 1000) + ttlSec;
    params.set('token', sha256(cfg.tokenKey + videoId + expires));
    params.set('expires', String(expires));
  }
  return `https://iframe.mediadelivery.net/embed/${cfg.libraryId}/${videoId}?${params}`;
}

export function bunnyThumbnail(cfg: BunnyConfig, videoId: string) {
  return cfg.cdnHost ? `https://${cfg.cdnHost}/${videoId}/thumbnail.jpg` : null;
}
