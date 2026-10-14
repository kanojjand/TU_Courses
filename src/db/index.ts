import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Подключение к PostgreSQL.
 *
 * `prepare: false` нужен для пулеров в режиме транзакций (Supavisor, PgBouncer):
 * на своём сервере без пулера он не мешает. Размер пула задаётся DB_POOL_MAX:
 * на Vercel каждая функция живёт отдельно — хватает 1–3 соединений,
 * на своём сервере ставьте 20+.
 */
const globalForDb = globalThis as unknown as { __tuSql?: postgres.Sql };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан. См. .env.example');
  return postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
}

export const sqlClient = globalForDb.__tuSql ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__tuSql = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };
