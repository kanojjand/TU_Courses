import { PrismaClient } from '@prisma/client';

import { seedReference } from '../src/server/seed/reference';
import { seedDemo } from '../src/server/seed/demo';

/**
 * Инициализация базы данных.
 *
 *   npm run db:seed            — справочники + демонстрационные данные
 *   SEED_DEMO=false npm run db:seed — только обязательные справочники
 *
 * Выполняется идемпотентно: повторный запуск не создаёт дубликатов.
 */

const prisma = new PrismaClient();

async function main() {
  console.log('→ Загрузка обязательных справочников…');
  await seedReference(prisma);
  console.log('  ✓ роли, шкалы оценивания (Приложения 1 и 2), настройки системы');

  if (process.env.SEED_DEMO === 'false') {
    console.log('→ Демонстрационные данные пропущены (SEED_DEMO=false)');
    return;
  }

  if (!process.env.IIN_ENCRYPTION_KEY) {
    console.error(
      '✗ Не задан IIN_ENCRYPTION_KEY — демонстрационные данные не могут быть загружены.\n' +
        '  Сгенерируйте ключ: openssl rand -base64 32'
    );
    process.exitCode = 1;
    return;
  }

  console.log('→ Загрузка демонстрационных данных…');
  await seedDemo(prisma);
  console.log('  ✓ факультет, кафедры, 2 программы, 8 дисциплин, 3 преподавателя, 30 обучающихся');
  console.log('  ✓ наполненный курс «Введение в информационные системы» (3 кр. = 90 ч)');

  console.log('\n⚠  Демонстрационные данные вымышлены и предназначены только для пилота.');
  console.log('   Промышленная эксплуатация допускается после переноса БД на инфраструктуру в РК.');
}

main()
  .catch((error) => {
    console.error('✗ Ошибка загрузки данных:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
