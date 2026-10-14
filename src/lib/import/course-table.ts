import type { BlockType } from '@/db/schema';
import { DOC_EXT, extOf, QUIZ_EXT, VIDEO_EXT } from '@/lib/rules/filenames';

/**
 * Таблица-оглавление курса (раздел 6, способ 1). Строка — один блок:
 * module_no, week, module_title, lesson_no, lesson_title, block_no, block_type,
 * block_title, file_or_text, required
 */
export type TableBlock = { rowNo: number; no: number; type: BlockType; title: string; value: string; required: boolean };
export type TableLesson = { no: number; title: string; blocks: TableBlock[] };
export type TableModule = { no: number; week: number; title: string; lessons: TableLesson[] };
export type TableIssue = { row: number; code: 'required' | 'badType' | 'badNumber' | 'missingFile' | 'badExt'; params?: Record<string, string> };

export const COURSE_COLUMNS = ['module_no', 'week', 'module_title', 'lesson_no', 'lesson_title', 'block_no', 'block_type', 'block_title', 'file_or_text', 'required'];

const TYPE_ALIASES: Record<BlockType, string[]> = {
  video: ['video', 'видео', 'бейне'],
  text: ['text', 'текст', 'мәтін', 'конспект'],
  file: ['file', 'файл', 'pdf', 'документ'],
  quiz: ['quiz', 'тест', 'test'],
  assignment: ['assignment', 'задание', 'тапсырма', 'task', 'лабораторная'],
  link: ['link', 'ссылка', 'сілтеме', 'url', 'zoom'],
};

export function parseBlockType(v: string): BlockType | null {
  const s = v.trim().toLowerCase();
  for (const [k, list] of Object.entries(TYPE_ALIASES) as [BlockType, string[]][]) if (k === s || list.includes(s)) return k;
  return null;
}

export function parseYesNo(v: string, fallback: boolean) {
  const s = v.trim().toLowerCase();
  if (!s) return fallback;
  if (['yes', 'да', 'иә', '1', 'true', 'y', 'обязательно', 'міндетті'].includes(s)) return true;
  if (['no', 'нет', 'жоқ', '0', 'false', 'n'].includes(s)) return false;
  return fallback;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '').trim().toLowerCase();

/** Разбор строк таблицы в дерево. files — пути в архиве (для проверки ссылок на файлы). */
export function parseCourseTable(rows: Record<string, string>[], files?: string[]): { modules: TableModule[]; issues: TableIssue[] } {
  const issues: TableIssue[] = [];
  const fileSet = files ? new Map(files.map((f) => [norm(f), f])) : null;
  const byModule = new Map<number, TableModule>();
  rows.forEach((r, i) => {
    const row = i + 2;
    const get = (k: string) => (r[k] ?? '').trim();
    if (!Object.values(r).some((v) => v && v.trim())) return;
    const nums: Record<string, number> = {};
    let bad = false;
    for (const k of ['module_no', 'lesson_no', 'block_no', 'week']) {
      const raw = get(k);
      if (!raw) {
        if (k === 'week' || k === 'block_no') continue;
        issues.push({ row, code: 'required', params: { column: k } });
        bad = true;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 999) {
        issues.push({ row, code: 'badNumber', params: { column: k } });
        bad = true;
      } else nums[k] = n;
    }
    const type = parseBlockType(get('block_type'));
    if (!type) {
      issues.push({ row, code: get('block_type') ? 'badType' : 'required', params: get('block_type') ? { value: get('block_type') } : { column: 'block_type' } });
      bad = true;
    }
    if (bad || !type) return;
    let value = get('file_or_text');
    if (type === 'video' || type === 'file' || type === 'quiz') {
      if (!value) {
        issues.push({ row, code: 'required', params: { column: 'file_or_text' } });
        return;
      }
      const ext = extOf(value);
      const allowed = type === 'video' ? VIDEO_EXT : type === 'quiz' ? QUIZ_EXT : DOC_EXT;
      if (!allowed.includes(ext)) issues.push({ row, code: 'badExt', params: { file: value } });
      if (fileSet) {
        const found = fileSet.get(norm(value));
        if (!found) issues.push({ row, code: 'missingFile', params: { file: value } });
        else value = found;
      }
    }
    let mod = byModule.get(nums.module_no);
    if (!mod) {
      mod = { no: nums.module_no, week: nums.week ?? nums.module_no, title: get('module_title') || `Модуль ${nums.module_no}`, lessons: [] };
      byModule.set(nums.module_no, mod);
    }
    let les = mod.lessons.find((l) => l.no === nums.lesson_no);
    if (!les) {
      les = { no: nums.lesson_no, title: get('lesson_title') || `Урок ${nums.lesson_no}`, blocks: [] };
      mod.lessons.push(les);
    }
    les.blocks.push({
      rowNo: row,
      no: nums.block_no ?? les.blocks.length + 1,
      type,
      title: get('block_title'),
      value,
      required: parseYesNo(get('required'), type === 'video' || type === 'quiz' || type === 'assignment'),
    });
  });
  const modules = [...byModule.values()].sort((a, b) => a.no - b.no);
  modules.forEach((m) => {
    m.lessons.sort((a, b) => a.no - b.no);
    m.lessons.forEach((l) => l.blocks.sort((a, b) => a.no - b.no));
  });
  return { modules, issues };
}

export const COURSE_TEMPLATE_ROWS = [
  ['1', '1', 'Введение', '1', 'Что такое ООП', '1', 'video', 'Лекция 1', 'videos/OOP_M01_L01.mp4', 'yes'],
  ['1', '1', 'Введение', '1', 'Что такое ООП', '2', 'file', 'Конспект', 'files/OOP_M01_L01.pdf', 'no'],
  ['1', '1', 'Введение', '1', 'Что такое ООП', '3', 'quiz', 'Проверка', 'quizzes/OOP_M01_L01.xlsx', 'yes'],
  ['1', '1', 'Введение', '2', 'Классы и объекты', '1', 'text', 'Главное', 'Класс — шаблон, объект — экземпляр класса.', 'no'],
  ['1', '1', 'Введение', '2', 'Классы и объекты', '2', 'assignment', 'Практика 1', 'Опишите класс Student с тремя полями.', 'yes'],
  ['1', '1', 'Введение', '2', 'Классы и объекты', '3', 'link', 'Консультация', 'https://zoom.us/j/0000000000', 'no'],
];
