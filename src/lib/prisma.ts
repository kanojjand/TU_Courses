import { PrismaClient } from '@prisma/client';

/**
 * Единый экземпляр Prisma Client.
 *
 * На Vercel каждая серверная функция — отдельный процесс, поэтому подключение
 * к Supabase выполняется через транзакционный пул (pgbouncer, порт 6543)
 * с connection_limit=1. Миграции идут через DIRECT_URL (порт 5432).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Prisma Decimal → number. Используется на границе слоёв. */
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

/** Prisma Decimal → number | null */
export function decOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}
