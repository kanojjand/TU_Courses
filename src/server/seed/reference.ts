import { PrismaClient } from '@prisma/client';

import { DEFAULT_SETTINGS } from '@/domain/constants';
import { LANGUAGE_GRADE_SCALE, STANDARD_GRADE_SCALE } from '@/domain/grading';
import { ROLE_LABELS, type RoleCode } from '@/lib/rbac';

/**
 * Обязательные справочники — раздел 2.3 ТЗ.
 *
 * Загружаются при инициализации и не подлежат редактированию пользователями.
 * Выполняется идемпотентно: повторный запуск безопасен.
 */
export async function seedReference(prisma: PrismaClient): Promise<void> {
  // ── Роли (раздел 3) ────────────────────────────────────────────────────────
  for (const code of Object.keys(ROLE_LABELS) as RoleCode[]) {
    const labels = ROLE_LABELS[code];
    await prisma.role.upsert({
      where: { code },
      create: {
        code,
        nameKk: labels.kk,
        nameRu: labels.ru,
        nameEn: labels.en,
      },
      update: { nameKk: labels.kk, nameRu: labels.ru, nameEn: labels.en },
    });
  }

  // ── Шкала оценивания: Приложение 1 к Типовым правилам ─────────────────────
  const standard = await prisma.gradeScale.upsert({
    where: { code: 'STANDARD' },
    create: {
      code: 'STANDARD',
      name: 'Приложение 1 к Типовым правилам деятельности ОВПО',
      isSystem: true,
    },
    update: {},
  });

  for (const [index, row] of STANDARD_GRADE_SCALE.entries()) {
    await prisma.gradeScaleItem.upsert({
      where: { scaleId_letter: { scaleId: standard.id, letter: row.letter } },
      create: {
        scaleId: standard.id,
        letter: row.letter,
        gpaPoints: row.gpaPoints,
        minPercent: row.minPercent,
        maxPercent: row.maxPercent,
        traditionalKk: row.traditionalKk,
        traditionalRu: row.traditionalRu,
        traditionalEn: row.traditionalEn,
        ects: row.ects,
        isPassing: row.isPassing,
        orderIndex: index,
      },
      update: {
        gpaPoints: row.gpaPoints,
        minPercent: row.minPercent,
        maxPercent: row.maxPercent,
        orderIndex: index,
      },
    });
  }

  // ── Шкала Приложения 2: языковые дисциплины с привязкой к ОЕК ─────────────
  const language = await prisma.gradeScale.upsert({
    where: { code: 'LANGUAGE' },
    create: {
      code: 'LANGUAGE',
      name: 'Приложение 2 — языковые дисциплины (уровни ОЕК A1–C2)',
      isSystem: true,
    },
    update: {},
  });

  for (const [index, row] of LANGUAGE_GRADE_SCALE.entries()) {
    await prisma.gradeScaleItem.upsert({
      where: { scaleId_letter: { scaleId: language.id, letter: row.letter } },
      create: {
        scaleId: language.id,
        letter: row.letter,
        gpaPoints: row.gpaPoints,
        minPercent: row.minPercent,
        maxPercent: row.maxPercent,
        traditionalKk: row.traditionalKk,
        traditionalRu: row.traditionalRu,
        traditionalEn: row.traditionalEn,
        ects: row.ects,
        cefr: (row.cefr as never) ?? null,
        isPassing: row.isPassing,
        orderIndex: index,
      },
      update: {
        cefr: (row.cefr as never) ?? null,
        orderIndex: index,
      },
    });
  }

  // ── Настройки системы (F-A-08) ────────────────────────────────────────────
  const descriptions: Record<string, string> = {
    academic_hour_minutes:
      'Продолжительность академического часа, минут. Подлежит уточнению по действующей редакции Приказа № 152 (вопрос 14.2.1 ТЗ).',
    course_hours_tolerance:
      'Допустимое отклонение суммы плановых часов курса от объёма в кредитах, академических часов.',
    enforce_work_type_norms:
      'Контроль соотношения контактных часов, СРОП и СРО (вопрос 14.2.2 ТЗ).',
    grade_midterm_count: 'Число периодов рубежного контроля.',
    grade_admission_weight: 'Вес рейтинга допуска в итоговом балле.',
    grade_exam_weight: 'Вес экзамена в итоговом балле.',
    grade_admission_threshold: 'Минимальный рейтинг допуска к экзамену, баллов.',
    grade_passing_score: 'Минимальный итоговый балл для положительной оценки.',
    grade_exam_min_score: 'Минимальный балл экзамена; 0 — не проверяется.',
    activity_heartbeat_interval_sec: 'Интервал сигнала активности клиента, секунд.',
    activity_idle_timeout_min: 'Порог неактивности для закрытия сессии, минут.',
    activity_max_counted_ratio:
      'Предельная доля плановой трудоёмкости, которую можно засчитать (защита от накрутки).',
    activity_video_completion_percent: 'Доля просмотра видео для засчитывания завершения, %.',
    course_require_methodist_review:
      'Обязательность согласования курса методистом перед публикацией (вопрос 14.2.9 ТЗ).',
    pdp_consent_version: 'Версия формы согласия на обработку персональных данных.',
    social_gpa_enabled:
      'Расчёт интегрированного социального GPA (п. 40 Типовых правил, вопрос 14.2.7 ТЗ).',
    max_upload_mb: 'Максимальный размер загружаемого файла, МБ.',
    retention_years_expelled:
      'Срок хранения данных отчисленных обучающихся, лет (вопрос 14.2.8 ТЗ).',
  };

  const categories: Record<string, string> = {
    academic_hour_minutes: 'academic',
    course_hours_tolerance: 'academic',
    enforce_work_type_norms: 'academic',
    course_require_methodist_review: 'academic',
    grade_midterm_count: 'grading',
    grade_admission_weight: 'grading',
    grade_exam_weight: 'grading',
    grade_admission_threshold: 'grading',
    grade_passing_score: 'grading',
    grade_exam_min_score: 'grading',
    activity_heartbeat_interval_sec: 'activity',
    activity_idle_timeout_min: 'activity',
    activity_max_counted_ratio: 'activity',
    activity_video_completion_percent: 'activity',
    pdp_consent_version: 'privacy',
    retention_years_expelled: 'privacy',
    social_gpa_enabled: 'grading',
    max_upload_mb: 'storage',
  };

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value,
        valueType: /^\d+(\.\d+)?$/.test(value) ? 'number' : value === 'true' || value === 'false' ? 'boolean' : 'string',
        category: categories[key] ?? 'general',
        description: descriptions[key],
      },
      update: { description: descriptions[key], category: categories[key] ?? 'general' },
    });
  }
}
