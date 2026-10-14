/**
 * Форматы файлов обмена с Platonus на время без API (раздел 5.2 ТЗ).
 * Колонки уточняются под реальные выгрузки — правка только здесь.
 */
export const IMPORT_KINDS = [
  'faculties',
  'departments',
  'programs',
  'groups',
  'teachers',
  'students',
  'disciplines',
  'offerings',
  'enrollments',
] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type ColumnSpec = { key: string; required?: boolean; example: string };

export const FORMATS: Record<ImportKind, ColumnSpec[]> = {
  faculties: [
    { key: 'code', required: true, example: 'FIT' },
    { key: 'name_kk', required: true, example: 'Ақпараттық технологиялар факультеті' },
    { key: 'name_ru', required: true, example: 'Факультет информационных технологий' },
    { key: 'name_en', example: 'Faculty of Information Technology' },
  ],
  departments: [
    { key: 'code', required: true, example: 'IS' },
    { key: 'faculty_code', required: true, example: 'FIT' },
    { key: 'name_kk', required: true, example: 'Ақпараттық жүйелер кафедрасы' },
    { key: 'name_ru', required: true, example: 'Кафедра информационных систем' },
    { key: 'name_en', example: 'Department of Information Systems' },
  ],
  programs: [
    { key: 'code', required: true, example: '6B06101' },
    { key: 'department_code', required: true, example: 'IS' },
    { key: 'degree', example: 'bachelor' },
    { key: 'name_kk', required: true, example: 'Ақпараттық жүйелер' },
    { key: 'name_ru', required: true, example: 'Информационные системы' },
    { key: 'name_en', example: 'Information Systems' },
  ],
  groups: [
    { key: 'code', required: true, example: 'ИС-23-1' },
    { key: 'program_code', required: true, example: '6B06101' },
    { key: 'course', required: true, example: '2' },
    { key: 'study_lang', required: true, example: 'ru' },
    { key: 'study_form', example: 'full_time' },
  ],
  teachers: [
    { key: 'platonus_id', required: true, example: 'T1001' },
    { key: 'last_name', required: true, example: 'Ахметова' },
    { key: 'first_name', required: true, example: 'Айгерим' },
    { key: 'middle_name', example: 'Болатовна' },
    { key: 'department_code', example: 'IS' },
    { key: 'position', example: 'Старший преподаватель' },
    { key: 'email', example: 'a.akhmetova@tashenev.edu.kz' },
    { key: 'login', example: 'a.akhmetova' },
  ],
  students: [
    { key: 'platonus_id', required: true, example: 'S230001' },
    { key: 'last_name', required: true, example: 'Серікұлы' },
    { key: 'first_name', required: true, example: 'Нұрлан' },
    { key: 'middle_name', example: '' },
    { key: 'group_code', required: true, example: 'ИС-23-1' },
    { key: 'course', example: '2' },
    { key: 'study_form', example: 'full_time' },
    { key: 'study_lang', example: 'kk' },
    { key: 'status', example: 'studying' },
    { key: 'email', example: 'n.serikuly@stud.tashenev.edu.kz' },
    { key: 'login', example: 's230001' },
  ],
  disciplines: [
    { key: 'code', required: true, example: 'OOP2201' },
    { key: 'name_kk', required: true, example: 'Объектіге бағытталған бағдарламалау' },
    { key: 'name_ru', required: true, example: 'Объектно-ориентированное программирование' },
    { key: 'name_en', example: 'Object-Oriented Programming' },
    { key: 'credits', example: '5' },
    { key: 'department_code', example: 'IS' },
  ],
  offerings: [
    { key: 'discipline_code', required: true, example: 'OOP2201' },
    { key: 'period', required: true, example: '2026-2027-1' },
    { key: 'lesson_type', required: true, example: 'lecture' },
    { key: 'stream', required: true, example: 'OOP-L-01' },
    { key: 'language', example: 'ru' },
    { key: 'teacher_platonus_id', example: 'T1001' },
  ],
  enrollments: [
    { key: 'platonus_student_id', required: true, example: 'S230001' },
    { key: 'discipline_code', required: true, example: 'OOP2201' },
    { key: 'period', required: true, example: '2026-2027-1' },
    { key: 'lesson_type', required: true, example: 'lecture' },
    { key: 'stream', required: true, example: 'OOP-L-01' },
    { key: 'teacher_platonus_id', example: 'T1001' },
  ],
};

/** Ведомость из LMS для регистратора */
export const SHEET_COLUMNS = [
  'platonus_student_id',
  'full_name',
  'group_code',
  'discipline_code',
  'stream',
  'component',
  'score',
  'late',
  'approved_by',
] as const;

/* ───────────── Нормализация значений: принимаем и коды, и слова на трёх языках ───────────── */

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

function lookup<T extends string>(table: Record<T, string[]>, value: string): T | null {
  const v = norm(value);
  if (!v) return null;
  for (const [key, aliases] of Object.entries(table) as [T, string[]][]) {
    if (key === v || aliases.some((a) => norm(a) === v)) return key;
  }
  return null;
}

export const parseStudyForm = (v: string) =>
  lookup(
    {
      full_time: ['очная', 'очно', 'күндізгі', 'full-time', 'fulltime', 'дневная'],
      part_time: ['заочная', 'заочно', 'сырттай', 'part-time', 'parttime'],
      distance: ['дистанционная', 'дот', 'қашықтықтан', 'online', 'онлайн'],
    },
    v,
  );

export const parseLang = (v: string) =>
  lookup(
    {
      kk: ['kz', 'каз', 'қаз', 'казахский', 'қазақ', 'қазақша', 'kaz', 'kazakh'],
      ru: ['рус', 'русский', 'орыс', 'rus', 'russian'],
      en: ['eng', 'англ', 'английский', 'ағылшын', 'english'],
    },
    v,
  );

export const parseStudentStatus = (v: string) =>
  lookup(
    {
      studying: ['обучается', 'оқиды', 'active', 'активен', 'учится'],
      academic_leave: ['академ', 'академический отпуск', 'академиялық демалыс', 'leave'],
      expelled: ['отчислен', 'шығарылды', 'expelled'],
      graduated: ['выпускник', 'түлек', 'окончил'],
    },
    v,
  );

export const parseLessonType = (v: string) =>
  lookup(
    {
      lecture: ['лекция', 'лек', 'дәріс', 'lec', 'л'],
      practice: ['практика', 'практ', 'семинар', 'практикалық', 'pr', 'п'],
      lab: ['лабораторная', 'лаб', 'зертханалық', 'laboratory', 'лр'],
      srop: ['срсп', 'сроп', 'соөж', 'офис часы', 'office hours'],
    },
    v,
  );

export const parseDegree = (v: string) =>
  lookup(
    {
      bachelor: ['бакалавриат', 'бакалавр', 'бакалавр.', 'bachelor', 'bsc'],
      master: ['магистратура', 'магистр', 'master', 'msc'],
      doctoral: ['докторантура', 'phd', 'доктор'],
    },
    v,
  );

/** Заголовки: регистр, пробелы и дефисы не важны */
export const normHeader = (h: string) =>
  h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
