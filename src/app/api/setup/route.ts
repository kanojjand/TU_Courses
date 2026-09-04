import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { seedReference } from '@/server/seed/reference';
import { seedDemo } from '@/server/seed/demo';
import { ensureBuckets } from '@/server/storage';

/**
 * Первичная инициализация системы после развёртывания.
 *
 * Позволяет выполнить загрузку справочников и демонстрационных данных
 * без локальной установки инструментов — достаточно одного запроса
 * из браузера или через curl.
 *
 *   GET  /api/setup            — состояние системы (что уже загружено)
 *   POST /api/setup            — загрузка обязательных справочников
 *   POST /api/setup?demo=true  — справочники + демонстрационные данные
 *   POST /api/setup?force=true — повторный запуск при уже загруженных данных
 *
 * Требуется заголовок: Authorization: Bearer <CRON_SECRET>
 *
 * ВАЖНО. Маршрут выполняет запись в базу данных. После завершения пилотной
 * настройки его следует отключить: удалите переменную CRON_SECRET либо
 * задайте SETUP_DISABLED=true.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(request: Request): NextResponse | null {
  if (process.env.SETUP_DISABLED === 'true') {
    return NextResponse.json(
      { error: 'Маршрут инициализации отключён (SETUP_DISABLED=true).' },
      { status: 403 }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Не задана переменная окружения CRON_SECRET — инициализация недоступна.' },
      { status: 500 }
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Неверный ключ доступа.' }, { status: 401 });
  }

  return null;
}

/** Проверка состояния: что уже загружено в базу */
export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    const [roles, scales, settings, users, courses] = await Promise.all([
      prisma.role.count(),
      prisma.gradeScale.count(),
      prisma.systemSetting.count(),
      prisma.user.count(),
      prisma.course.count(),
    ]);

    return NextResponse.json({
      database: 'подключение установлено',
      reference: {
        roles,
        gradeScales: scales,
        settings,
        loaded: roles > 0 && scales > 0 && settings > 0,
      },
      demo: { users, courses, loaded: users > 0 },
      ready: roles > 0 && scales > 0 && users > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: 'Не удалось обратиться к базе данных.',
        details: message.slice(0, 500),
        hint:
          'Проверьте DATABASE_URL и DIRECT_URL, а также что схема создана ' +
          '(команда сборки должна включать prisma db push или prisma migrate deploy).',
      },
      { status: 500 }
    );
  }
}

/** Загрузка справочников и, по запросу, демонстрационных данных */
export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const withDemo = url.searchParams.get('demo') === 'true';
  const force = url.searchParams.get('force') === 'true';

  const log: string[] = [];

  try {
    // Защита от случайного повторного запуска на работающей системе
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0 && withDemo && !force) {
      return NextResponse.json(
        {
          error: `В системе уже есть пользователи (${existingUsers}).`,
          hint: 'Для повторной загрузки демо-данных добавьте параметр ?force=true',
        },
        { status: 409 }
      );
    }

    if (!process.env.IIN_ENCRYPTION_KEY && withDemo) {
      return NextResponse.json(
        {
          error: 'Не задан IIN_ENCRYPTION_KEY — демонстрационные данные загрузить нельзя.',
          hint: 'Сгенерируйте ключ: openssl rand -base64 32 (ровно 32 байта в base64).',
        },
        { status: 400 }
      );
    }

    await seedReference(prisma);
    log.push('Справочники загружены: роли, шкалы оценивания (Приложения 1 и 2), настройки системы.');

    // Бакеты хранилища создаются, если их ещё нет
    try {
      await ensureBuckets();
      log.push('Бакеты объектного хранилища проверены.');
    } catch (error) {
      log.push(
        `Бакеты хранилища создать не удалось: ${
          error instanceof Error ? error.message : 'ошибка'
        }. Создайте их вручную в панели Supabase.`
      );
    }

    if (withDemo) {
      await seedDemo(prisma);
      log.push(
        'Демонстрационные данные загружены: факультет, 2 кафедры, 2 программы, ' +
          '8 дисциплин, 3 преподавателя, 30 обучающихся, наполненный курс.'
      );
    }

    const [roles, users, courses] = await Promise.all([
      prisma.role.count(),
      prisma.user.count(),
      prisma.course.count(),
    ]);

    return NextResponse.json({
      ok: true,
      log,
      state: { roles, users, courses },
      ...(withDemo
        ? {
            credentials: {
              password: 'Demo2026!lms',
              accounts: [
                'admin@demo.example.kz — администратор',
                'registrar@demo.example.kz — офис регистратора',
                'methodist@demo.example.kz — методист кафедры',
                'a.nurgaliev@demo.example.kz — преподаватель',
                'a.ahmetov1@demo.example.kz — обучающийся',
              ],
              warning:
                'Демонстрационные данные вымышлены. Смените пароли перед любым реальным использованием.',
            },
          }
        : {}),
      next: 'Откройте главную страницу сайта и войдите под одной из учётных записей.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Инициализация прервана.', completed: log, details: message.slice(0, 800) },
      { status: 500 }
    );
  }
}
