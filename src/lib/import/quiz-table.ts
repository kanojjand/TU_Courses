import type { QuestionType } from '@/db/schema';

/**
 * Тесты из Excel (раздел 6, способ 3): одна таблица = один банк вопросов.
 * Колонки: type, question, difficulty, a…f, correct.
 */
export type ParsedQuestion = {
  type: QuestionType;
  text: string;
  difficulty: number;
  options: { text: string; isCorrect: boolean; matchText: string | null }[];
  answers?: string[];
};
export type QuizRowError = { row: number; code: 'noQuestion' | 'noOptions' | 'noCorrect' | 'badCorrect' | 'badType' | 'badMatching' | 'noAnswers' };

const ALIASES: Record<string, string[]> = {
  type: ['type', 'тип', 'түрі'],
  question: ['question', 'вопрос', 'сұрақ', 'text', 'текст'],
  difficulty: ['difficulty', 'сложность', 'күрделілік', 'level'],
  correct: ['correct', 'ответ', 'верный', 'правильный', 'дұрыс', 'answer'],
};
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const CYR = ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з'];

function col(row: Record<string, string>, key: string) {
  for (const a of ALIASES[key] ?? [key]) if (row[a] !== undefined && row[a] !== '') return row[a].trim();
  return '';
}

function optionValues(row: Record<string, string>) {
  const out: string[] = [];
  for (let i = 0; i < LETTERS.length; i++) {
    const v = row[LETTERS[i]] ?? row[CYR[i]] ?? row[`option${i + 1}`] ?? row[`вариант${i + 1}`] ?? row[`нұсқа${i + 1}`];
    if (v !== undefined && v.trim() !== '') out.push(v.trim());
  }
  return out;
}

export function parseType(v: string): QuestionType | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (['single', 'один', 'один ответ', 'бір', 'бір жауап', 'radio'].includes(s)) return 'single';
  if (['multiple', 'несколько', 'несколько ответов', 'бірнеше', 'checkbox', 'multi'].includes(s)) return 'multiple';
  if (['matching', 'соответствие', 'сәйкестік', 'match'].includes(s)) return 'matching';
  if (['ordering', 'порядок', 'реттілік', 'order', 'последовательность'].includes(s)) return 'ordering';
  if (['short', 'короткий', 'короткий ответ', 'қысқа', 'қысқа жауап', 'text', 'текст'].includes(s)) return 'short';
  return null;
}

function letterIndex(token: string) {
  const s = token.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s) - 1;
  const i = LETTERS.indexOf(s);
  return i >= 0 ? i : CYR.indexOf(s);
}

export function parseQuizRows(rows: Record<string, string>[]): { questions: ParsedQuestion[]; errors: QuizRowError[] } {
  const questions: ParsedQuestion[] = [];
  const errors: QuizRowError[] = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const text = col(r, 'question');
    if (!text) {
      if (Object.values(r).some((v) => v && v.trim())) errors.push({ row: rowNo, code: 'noQuestion' });
      return;
    }
    const opts = optionValues(r);
    const correctRaw = col(r, 'correct');
    const d = Number(col(r, 'difficulty') || 1);
    const difficulty = [1, 2, 3].includes(d) ? d : 1;
    let type = col(r, 'type') ? parseType(col(r, 'type')) : null;
    if (col(r, 'type') && !type) return void errors.push({ row: rowNo, code: 'badType' });
    if (!type) {
      if (opts.length && opts.every((o) => o.includes('='))) type = 'matching';
      else if (!opts.length) type = 'short';
      else type = correctRaw.split(/[,;\s]+/).filter(Boolean).length > 1 ? 'multiple' : 'single';
    }
    if (type === 'short') {
      const answers = correctRaw.split(';').map((s) => s.trim()).filter(Boolean);
      if (!answers.length) return void errors.push({ row: rowNo, code: 'noAnswers' });
      questions.push({ type, text, difficulty, options: [], answers });
      return;
    }
    if (opts.length < 2) return void errors.push({ row: rowNo, code: 'noOptions' });
    if (type === 'matching') {
      const pairs = opts.map((o) => o.split('=').map((x) => x.trim()));
      if (pairs.some((p) => p.length !== 2 || !p[0] || !p[1])) return void errors.push({ row: rowNo, code: 'badMatching' });
      questions.push({ type, text, difficulty, options: pairs.map(([l, rgt]) => ({ text: l, isCorrect: true, matchText: rgt })) });
      return;
    }
    if (type === 'ordering') {
      questions.push({ type, text, difficulty, options: opts.map((o) => ({ text: o, isCorrect: true, matchText: null })) });
      return;
    }
    const idx = correctRaw.split(/[,;\s]+/).filter(Boolean).map(letterIndex);
    if (!idx.length) return void errors.push({ row: rowNo, code: 'noCorrect' });
    if (idx.some((x) => x < 0 || x >= opts.length)) return void errors.push({ row: rowNo, code: 'badCorrect' });
    if (type === 'single' && idx.length !== 1) type = 'multiple';
    questions.push({ type, text, difficulty, options: opts.map((o, k) => ({ text: o, isCorrect: idx.includes(k), matchText: null })) });
  });
  return { questions, errors };
}

export const QUIZ_TEMPLATE_HEADER = ['type', 'question', 'difficulty', 'a', 'b', 'c', 'd', 'e', 'f', 'correct'];
export const QUIZ_TEMPLATE_ROWS = [
  ['single', 'Что такое класс?', '1', 'Шаблон для объектов', 'Переменная', 'Цикл', '', '', '', 'a'],
  ['multiple', 'Выберите принципы ООП', '2', 'Инкапсуляция', 'Наследование', 'Компиляция', 'Полиморфизм', '', '', 'a,b,d'],
  ['matching', 'Сопоставьте', '2', 'Класс = Шаблон', 'Объект = Экземпляр', 'Метод = Функция класса', '', '', '', ''],
  ['ordering', 'Расставьте по порядку', '3', 'Описать класс', 'Создать объект', 'Вызвать метод', '', '', '', ''],
  ['short', 'Как называется функция внутри класса?', '1', '', '', '', '', '', '', 'метод;method'],
];
