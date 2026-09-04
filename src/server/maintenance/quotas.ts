import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Раздел 6.2 ТЗ и риск «исчерпание бесплатных квот» (раздел 13).
 *
 * Supabase выполняет резервное копирование самостоятельно; эта проверка
 * независимо снимает контрольные метрики и предупреждает администраторов
 * о приближении к лимитам тарифа.
 */

/** Порог оповещения — 70 % квоты (раздел 13 ТЗ) */
const WARN_RATIO = 0.7;
/** Квота Supabase Free: 500 МБ база данных, 1 ГБ объектное хранилище */
const DB_QUOTA_MB = 500;
const STORAGE_QUOTA_MB = 1024;

export async function checkQuotas() {
  const [{ size_mb: dbSizeMb }] = await prisma.$queryRaw<{ size_mb: number }[]>`
    SELECT ROUND(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)::float8 AS size_mb
  `;

  const storage = await prisma.attachment.aggregate({ _sum: { sizeBytes: true } });
  const storageMb = Math.round((Number(storage._sum.sizeBytes ?? 0) / 1024 / 1024) * 100) / 100;

  const warnings: string[] = [];

  if (dbSizeMb / DB_QUOTA_MB > WARN_RATIO) {
    warnings.push(
      `База данных занимает ${dbSizeMb} МБ из ${DB_QUOTA_MB} МБ квоты ` +
        `(${Math.round((dbSizeMb / DB_QUOTA_MB) * 100)} %).`
    );
  }

  if (storageMb / STORAGE_QUOTA_MB > WARN_RATIO) {
    warnings.push(
      `Объектное хранилище занимает ${storageMb} МБ из ${STORAGE_QUOTA_MB} МБ квоты ` +
        `(${Math.round((storageMb / STORAGE_QUOTA_MB) * 100)} %).`
    );
  }

  if (warnings.length > 0) {
    const admins = await prisma.user.findMany({
      where: { roles: { some: { role: { code: 'ADMIN' } } }, status: 'ACTIVE' },
      select: { id: true },
    });

    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: 'SYSTEM' as const,
        title: 'Приближение к лимитам инфраструктуры',
        body: warnings.join(' '),
        link: '/admin/settings',
      })),
    });
  }

  return {
    dbSizeMb,
    dbQuotaMb: DB_QUOTA_MB,
    storageMb,
    storageQuotaMb: STORAGE_QUOTA_MB,
    warnings,
  };
}
