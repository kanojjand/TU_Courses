/**
 * Константы предметной области.
 *
 * ВАЖНО (раздел 4.2 ТЗ): значения, которые вуз может переопределить, здесь
 * присутствуют только как значения по умолчанию. Фактические значения читаются
 * из таблицы `system_settings` через `src/server/settings.ts`.
 */

/**
 * Один академический кредит = 30 академическим часам.
 * Источник: Приказ МНВО РК от 20.07.2022 № 2 (ГОСО), п. 29 (бакалавриат),
 * п. 56 (магистратура), п. 102 (докторантура).
 * Базовая константа расчёта трудоёмкости — не настраивается.
 */
export const HOURS_PER_CREDIT = 30;

/**
 * Продолжительность академического часа в минутах.
 * Открытый вопрос 14.2.1 ТЗ (50 или 60 по действующей редакции Приказа № 152).
 * Значение по умолчанию — 50; переопределяется настройкой `academic_hour_minutes`.
 */
export const DEFAULT_ACADEMIC_HOUR_MINUTES = 50;

/** Ключи настроек системы */
export const SETTINGS = {
  ACADEMIC_HOUR_MINUTES: 'academic_hour_minutes',
  HOURS_TOLERANCE: 'course_hours_tolerance',
  ENFORCE_WORK_TYPE_NORMS: 'enforce_work_type_norms',
  MIDTERM_COUNT: 'grade_midterm_count',
  ADMISSION_WEIGHT: 'grade_admission_weight',
  EXAM_WEIGHT: 'grade_exam_weight',
  ADMISSION_THRESHOLD: 'grade_admission_threshold',
  PASSING_SCORE: 'grade_passing_score',
  EXAM_MIN_SCORE: 'grade_exam_min_score',
  HEARTBEAT_INTERVAL_SEC: 'activity_heartbeat_interval_sec',
  IDLE_TIMEOUT_MIN: 'activity_idle_timeout_min',
  MAX_COUNTED_RATIO: 'activity_max_counted_ratio',
  VIDEO_COMPLETION_PERCENT: 'activity_video_completion_percent',
  REQUIRE_METHODIST_REVIEW: 'course_require_methodist_review',
  PDP_CONSENT_VERSION: 'pdp_consent_version',
  SOCIAL_GPA_ENABLED: 'social_gpa_enabled',
  MAX_UPLOAD_MB: 'max_upload_mb',
  RETENTION_YEARS_EXPELLED: 'retention_years_expelled',
  // F-LRN-06: порог посещаемости для попадания в группу риска.
  // ГОСО и Типовые правила фиксированного значения не задают — решение
  // о недопуске принимает вуз, поэтому это настройка, а не константа.
  ATTENDANCE_THRESHOLD: 'attendance_threshold_percent',
} as const;

/** Значения настроек по умолчанию (раздел 4.3 — типовая практика вузов РК) */
export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTINGS.ACADEMIC_HOUR_MINUTES]: '50',
  [SETTINGS.HOURS_TOLERANCE]: '0',
  [SETTINGS.ENFORCE_WORK_TYPE_NORMS]: 'false',
  [SETTINGS.MIDTERM_COUNT]: '2',
  [SETTINGS.ADMISSION_WEIGHT]: '0.6',
  [SETTINGS.EXAM_WEIGHT]: '0.4',
  [SETTINGS.ADMISSION_THRESHOLD]: '50',
  [SETTINGS.PASSING_SCORE]: '50',
  [SETTINGS.EXAM_MIN_SCORE]: '0',
  [SETTINGS.HEARTBEAT_INTERVAL_SEC]: '30',
  [SETTINGS.IDLE_TIMEOUT_MIN]: '5',
  [SETTINGS.MAX_COUNTED_RATIO]: '1.5',
  [SETTINGS.VIDEO_COMPLETION_PERCENT]: '80',
  [SETTINGS.REQUIRE_METHODIST_REVIEW]: 'true',
  [SETTINGS.PDP_CONSENT_VERSION]: '1.0',
  [SETTINGS.SOCIAL_GPA_ENABLED]: 'false',
  [SETTINGS.MAX_UPLOAD_MB]: '100',
  [SETTINGS.RETENTION_YEARS_EXPELLED]: '5',
  [SETTINGS.ATTENDANCE_THRESHOLD]: '50',
};

/** Максимальный размер загружаемого файла (раздел 6.1) */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Разрешённые типы файлов учебных материалов (F-T-04) */
export const ALLOWED_MATERIAL_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'text/plain',
] as const;

export const LOCALES = ['kk', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** Казахский — язык по умолчанию (F-L-01) */
export const DEFAULT_LOCALE: Locale = 'kk';

/**
 * Специфические символы казахского алфавита (F-L-05).
 * Используются страницей самопроверки шрифта /admin/settings/fonts.
 */
export const KAZAKH_SPECIFIC_CHARS = 'ӘәҒғҚқҢңӨөҰұҮүҺһІі';
