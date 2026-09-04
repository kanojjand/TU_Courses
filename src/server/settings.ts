import 'server-only';
import { prisma } from '@/lib/prisma';
import { DEFAULT_SETTINGS, SETTINGS } from '@/domain/constants';
import type { GradeConfigSpec } from '@/domain/grading';
import type { ActivityParams } from '@/domain/activity';

/**
 * Настройки системы (F-A-08).
 *
 * Значения хранятся в БД, а не в коде (раздел 4.2 ТЗ). Кэшируются в памяти
 * процесса на короткое время — на Vercel это снижает число запросов к Supabase
 * и расход трафика (риск «превышение лимита трафика БД», раздел 13).
 */

const CACHE_TTL_MS = 60_000;
let cache: { at: number; values: Record<string, string> } | null = null;

export async function loadSettings(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  const rows = await prisma.systemSetting.findMany();
  const values = { ...DEFAULT_SETTINGS };
  for (const row of rows) values[row.key] = row.value;
  cache = { at: Date.now(), values };
  return values;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSetting(key: string): Promise<string> {
  const values = await loadSettings();
  return values[key] ?? DEFAULT_SETTINGS[key] ?? '';
}

export async function getNumberSetting(key: string): Promise<number> {
  const raw = await getSetting(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key] ?? 0);
}

export async function getBooleanSetting(key: string): Promise<boolean> {
  return (await getSetting(key)) === 'true';
}

export async function setSetting(
  key: string,
  value: string,
  updatedById?: string
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedById },
    update: { value, updatedById },
  });
  invalidateSettingsCache();
}

/** Параметры учёта активности из настроек */
export async function getActivityParams(): Promise<ActivityParams> {
  const s = await loadSettings();
  return {
    heartbeatIntervalSec: Number(s[SETTINGS.HEARTBEAT_INTERVAL_SEC]),
    idleTimeoutMin: Number(s[SETTINGS.IDLE_TIMEOUT_MIN]),
    maxCountedRatio: Number(s[SETTINGS.MAX_COUNTED_RATIO]),
    academicHourMinutes: Number(s[SETTINGS.ACADEMIC_HOUR_MINUTES]),
  };
}

/**
 * Параметры расчёта оценки с наследованием: вуз → дисциплина → курс.
 * Более частная настройка переопределяет более общую.
 */
export async function getGradeConfig(opts: {
  disciplineId?: string;
  courseId?: string;
}): Promise<GradeConfigSpec> {
  const s = await loadSettings();
  let config: GradeConfigSpec = {
    midtermCount: Number(s[SETTINGS.MIDTERM_COUNT]),
    admissionWeight: Number(s[SETTINGS.ADMISSION_WEIGHT]),
    examWeight: Number(s[SETTINGS.EXAM_WEIGHT]),
    admissionThreshold: Number(s[SETTINGS.ADMISSION_THRESHOLD]),
    passingScore: Number(s[SETTINGS.PASSING_SCORE]),
    examMinScore: Number(s[SETTINGS.EXAM_MIN_SCORE]),
  };

  const overrides = await prisma.gradeConfig.findMany({
    where: {
      OR: [
        opts.disciplineId ? { disciplineId: opts.disciplineId } : undefined,
        opts.courseId ? { courseId: opts.courseId } : undefined,
      ].filter(Boolean) as { disciplineId?: string; courseId?: string }[],
    },
  });

  // Сначала дисциплина, затем курс — курс имеет высший приоритет
  const ordered = [
    overrides.find((o) => o.disciplineId === opts.disciplineId),
    overrides.find((o) => o.courseId === opts.courseId),
  ].filter(Boolean);

  for (const o of ordered) {
    if (!o) continue;
    config = {
      midtermCount: o.midtermCount,
      admissionWeight: Number(o.admissionWeight),
      examWeight: Number(o.examWeight),
      admissionThreshold: Number(o.admissionThreshold),
      passingScore: Number(o.passingScore),
      examMinScore: Number(o.examMinScore),
    };
  }

  return config;
}

/** Допустимое отклонение при проверке часов курса */
export async function getHoursTolerance(): Promise<number> {
  return getNumberSetting(SETTINGS.HOURS_TOLERANCE);
}

/** Требуется ли согласование курса методистом (вопрос 14.2.9 ТЗ) */
export async function requiresMethodistReview(): Promise<boolean> {
  return getBooleanSetting(SETTINGS.REQUIRE_METHODIST_REVIEW);
}

/** Текущая версия формы согласия на обработку ПДн */
export async function getConsentVersion(): Promise<string> {
  return getSetting(SETTINGS.PDP_CONSENT_VERSION);
}
