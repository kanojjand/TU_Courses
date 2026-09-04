import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Объектное хранилище — Supabase Storage.
 *
 * Требования раздела 6.3 ТЗ:
 *  — доступ к файлам только по подписанным ссылкам с ограниченным сроком;
 *  — прямые публичные ссылки на хранилище недопустимы.
 *
 * Требование F-T-04: загрузка идёт напрямую в хранилище по подписанной ссылке,
 * минуя сервер приложения — это существенно, поскольку на Vercel тело запроса
 * к серверной функции ограничено, а трафик БД тарифицируется.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const BUCKET_MATERIALS = process.env.SUPABASE_BUCKET_MATERIALS ?? 'materials';
export const BUCKET_SUBMISSIONS = process.env.SUPABASE_BUCKET_SUBMISSIONS ?? 'submissions';

/** Клиент с сервисным ключом. Только на сервере — ключ обходит политики RLS. */
function admin() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      'Не заданы NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. См. .env.example'
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Безопасное имя файла: латиница/кириллица, цифры, дефис, подчёркивание, точка */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
  return cleaned || 'file';
}

/** Ключ объекта учебного материала */
export function materialKey(courseId: string, itemId: string, fileName: string): string {
  return `courses/${courseId}/items/${itemId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

/** Ключ объекта сданной работы */
export function submissionKey(
  assignmentId: string,
  studentId: string,
  fileName: string
): string {
  return `assignments/${assignmentId}/${studentId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

/**
 * Подписанная ссылка на загрузку (F-T-04).
 * Клиент выполняет PUT напрямую в Supabase Storage.
 */
export async function createUploadUrl(
  bucket: string,
  key: string
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await admin().storage.from(bucket).createSignedUploadUrl(key);
  if (error || !data) throw new Error(`Не удалось создать ссылку на загрузку: ${error?.message}`);
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/**
 * Подписанная ссылка на скачивание/просмотр.
 * @param expiresInSec срок действия, секунд (по умолчанию 15 минут)
 * @param download     true — принудительное скачивание; false — просмотр во встроенном
 *                     просмотрщике без сохранения на устройство (F-S-05)
 */
export async function createDownloadUrl(
  bucket: string,
  key: string,
  expiresInSec = 900,
  download = false,
  fileName?: string
): Promise<string> {
  const { data, error } = await admin()
    .storage.from(bucket)
    .createSignedUrl(key, expiresInSec, download ? { download: fileName ?? true } : undefined);
  if (error || !data) throw new Error(`Не удалось создать ссылку: ${error?.message}`);
  return data.signedUrl;
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  const { error } = await admin().storage.from(bucket).remove([key]);
  if (error) throw new Error(`Не удалось удалить объект: ${error.message}`);
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  const parts = key.split('/');
  const fileName = parts.pop() ?? '';
  const { data, error } = await admin()
    .storage.from(bucket)
    .list(parts.join('/'), { search: fileName, limit: 1 });
  return !error && (data?.length ?? 0) > 0;
}

/** Размер объекта, байт (для сверки с заявленным при загрузке) */
export async function objectSize(bucket: string, key: string): Promise<number | null> {
  const parts = key.split('/');
  const fileName = parts.pop() ?? '';
  const { data } = await admin()
    .storage.from(bucket)
    .list(parts.join('/'), { search: fileName, limit: 1 });
  const meta = data?.[0]?.metadata as { size?: number } | undefined;
  return meta?.size ?? null;
}

/**
 * Создание бакетов при инициализации окружения.
 * Оба бакета приватные — публичный доступ к учебным материалам недопустим.
 */
export async function ensureBuckets(): Promise<void> {
  const client = admin();
  for (const bucket of [BUCKET_MATERIALS, BUCKET_SUBMISSIONS]) {
    const { data } = await client.storage.getBucket(bucket);
    if (!data) {
      await client.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: '100MB',
      });
    }
  }
}
