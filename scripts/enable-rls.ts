import { PrismaClient } from '@prisma/client';

/**
 * Включение Row Level Security на всех таблицах схемы public.
 *
 *   npm run db:rls
 *
 * ЗАЧЕМ ЭТО ОБЯЗАТЕЛЬНО
 *
 * Supabase поднимает над базой публичный REST-интерфейс (PostgREST). Ключ
 * NEXT_PUBLIC_SUPABASE_ANON_KEY по своей природе публичен — он попадает в
 * JavaScript-бандл и виден любому посетителю сайта. Единственное, что
 * ограничивает этот ключ, — RLS.
 *
 * Prisma создаёт таблицы командой `db push` / `migrate deploy` и RLS не
 * включает. В результате на свежей базе анонимный ключ получает полный
 * доступ к таблицам схемы public: чтение (включая passwordHash и
 * iinEncrypted), изменение и удаление любых строк.
 *
 * Скрипт включает RLS без создания политик. Это означает «запрещено всем»
 * для ролей anon и authenticated.
 *
 * На работу приложения это не влияет: Prisma подключается пользователем
 * postgres, который является владельцем таблиц, а ENABLE ROW LEVEL SECURITY
 * (в отличие от FORCE ROW LEVEL SECURITY) на владельца не распространяется.
 * Клиент @supabase/supabase-js используется только на сервере и только с
 * сервисным ключом — он RLS обходит штатно.
 *
 * ЗАПУСКАТЬ ПОСЛЕ КАЖДОГО `prisma db push` НА НОВОЙ БАЗЕ:
 * новые таблицы создаются с выключенным RLS.
 */

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string; rls: boolean }[]>(
    `SELECT c.relname AS tablename, c.relrowsecurity AS rls
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname`
  );

  if (tables.length === 0) {
    throw new Error('В схеме public нет таблиц — сначала выполните npm run db:push.');
  }

  const off = tables.filter((t) => !t.rls);
  console.log(`Таблиц в схеме public: ${tables.length}, без RLS: ${off.length}`);

  for (const t of off) {
    // Имя приходит из системного каталога, но кавычки обязательны:
    // Prisma создаёт таблицы в нижнем регистре, а идентификаторы могут
    // содержать символы, требующие экранирования.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "public"."${t.tablename}" ENABLE ROW LEVEL SECURITY`
    );
    console.log(`  RLS включён: ${t.tablename}`);
  }

  const after = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false`
  );

  const remaining = Number(after[0].n);
  if (remaining > 0) {
    throw new Error(`Осталось таблиц без RLS: ${remaining}`);
  }

  console.log(`\nГотово. RLS включён на всех ${tables.length} таблицах, политик нет —`);
  console.log('анонимный и authenticated доступ через PostgREST закрыт полностью.');
}

main()
  .catch((error) => {
    console.error('Ошибка:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
