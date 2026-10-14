/**
 * Фоновый процесс для своего сервера: очередь pg-boss на той же PostgreSQL
 * (отдельный Redis не нужен). Запуск: npm run worker
 *
 * Расписание: каждые 10 минут — тесты с истёкшим временем и видео,
 * каждый день в 07:00 по Алматы — напоминания о сроках и уборка.
 */
import Module from 'node:module';
import path from 'node:path';
import { PgBoss } from 'pg-boss';

// Модули приложения помечены 'server-only' (защита от попадания в браузер).
// Вне Next.js подменяем его пустым модулем.
const emptyServerOnly = path.join(path.dirname(require.resolve('server-only')), 'empty.js');
const mod = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return emptyServerOnly;
  return resolve.call(this, request, ...rest);
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');
  const { JOBS } = await import('../src/jobs');
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
  boss.on('error', (e) => console.error('[pg-boss]', e));
  await boss.start();
  for (const name of ['lms-frequent', 'lms-daily'] as const) await boss.createQueue(name);
  await boss.schedule('lms-frequent', '*/10 * * * *', {}, { tz: 'Asia/Almaty' });
  await boss.schedule('lms-daily', '0 7 * * *', {}, { tz: 'Asia/Almaty' });
  await boss.work('lms-frequent', async () => console.log('[frequent]', await JOBS.frequent()));
  await boss.work('lms-daily', async () => console.log('[daily]', await JOBS.daily()));
  console.log('TU Online worker: очереди запущены');
  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
