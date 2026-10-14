/**
 * Применяет SQL-миграции из папки drizzle/ по порядку.
 *
 * Свой простой мигратор вместо drizzle-kit migrate: те же файлы можно
 * применить вручную через psql или SQL-редактор Supabase, а учёт ведётся
 * в таблице lms_meta.migrations (имя файла + время).
 *
 *   DATABASE_URL=... npm run db:migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL не задан');
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const dir = path.join(process.cwd(), 'drizzle');
  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS lms_meta;
      CREATE TABLE IF NOT EXISTS lms_meta.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
    const applied = new Set((await sql<{ name: string }[]>`SELECT name FROM lms_meta.migrations`).map((r) => r.name));
    const filesToApply = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => !applied.has(f));
    if (filesToApply.length === 0) {
      console.log('Миграции: всё уже применено');
      return;
    }
    for (const file of filesToApply) {
      const body = readFileSync(path.join(dir, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO lms_meta.migrations (name) VALUES (${file})`;
      });
      console.log(`✓ ${file}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
