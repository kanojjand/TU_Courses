import 'server-only';
import { AwsClient } from 'aws4fetch';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { fileBlobs, files } from '@/db/schema';

/**
 * Хранение файлов (PDF, слайды, сдачи заданий).
 *  - db  — бесплатный стенд: тело файла в PostgreSQL (до ~4 МБ на файл на Vercel);
 *  - s3  — свой сервер: MinIO или S3-совместимое хранилище в РК.
 * Переключение — переменная STORAGE_DRIVER, код страниц не меняется.
 */
const driver = () => (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'db');

function s3() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) throw new Error('S3 не настроен');
  const client = new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION ?? 'us-east-1',
    service: 's3',
  });
  return { client, url: (key: string) => `${endpoint.replace(/\/$/, '')}/${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}` };
}

export const MAX_DB_FILE = 25 * 1024 * 1024;

export async function putFile(opts: { data: Buffer; filename: string; mime?: string; ownerId: string | null; prefix?: string }) {
  const id = crypto.randomUUID();
  const safeName = opts.filename.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(-120) || 'file';
  const key = `${opts.prefix ?? 'files'}/${new Date().toISOString().slice(0, 7)}/${id}/${safeName}`;
  const mime = opts.mime || 'application/octet-stream';
  if (driver() === 's3') {
    const { client, url } = s3();
    const res = await client.fetch(url(key), { method: 'PUT', body: new Uint8Array(opts.data), headers: { 'content-type': mime } });
    if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
  } else if (opts.data.length > MAX_DB_FILE) {
    throw new Error('FILE_TOO_LARGE');
  }
  await db.transaction(async (tx) => {
    await tx.insert(files).values({ id, storageKey: key, filename: opts.filename, mime, size: opts.data.length, ownerId: opts.ownerId });
    if (driver() === 'db') await tx.insert(fileBlobs).values({ fileId: id, data: opts.data });
  });
  return { id, filename: opts.filename, size: opts.data.length, mime };
}

export async function getFileMeta(id: string) {
  const [f] = await db.select().from(files).where(eq(files.id, id));
  return f ?? null;
}

/** Тело файла: сначала из базы (файлы бесплатного стенда переезжают вместе с дампом), иначе из S3 */
export async function readFileBody(f: typeof files.$inferSelect): Promise<BodyInit | null> {
  const [blob] = await db.select().from(fileBlobs).where(eq(fileBlobs.fileId, f.id));
  if (blob) return new Uint8Array(blob.data);
  if (driver() !== 's3') return null;
  const { client, url } = s3();
  const res = await client.fetch(url(f.storageKey));
  return res.ok ? res.body : null;
}
