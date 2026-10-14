import { describe, expect, it } from 'vitest';
import { parseCourseTable } from '@/lib/import/course-table';
import { parseQuizRows } from '@/lib/import/quiz-table';
import { parseLang, parseLessonType, parseStudyForm } from '@/lib/platonus/formats';
import { parseVideoName } from '@/lib/rules/filenames';

describe('имена видео КОД_M01_L03', () => {
  it('разбирает модуль, урок и часть', () => {
    expect(parseVideoName('OOP_M01_L03.mp4')).toEqual({ code: 'OOP', module: 1, lesson: 3, part: 1 });
    expect(parseVideoName('videos/ООП-m2-l10_2.MOV')).toEqual({ code: 'ООП', module: 2, lesson: 10, part: 2 });
    expect(parseVideoName('lecture.mp4')).toBeNull();
    expect(parseVideoName('OOP_M01_L03.pdf')).toBeNull();
  });
});

describe('таблица курса course.xlsx', () => {
  const rows = [
    { module_no: '1', week: '1', module_title: 'Введение', lesson_no: '1', lesson_title: 'ООП', block_no: '1', block_type: 'video', block_title: 'Лекция', file_or_text: 'videos/OOP_M01_L01.mp4', required: 'yes' },
    { module_no: '1', week: '1', module_title: 'Введение', lesson_no: '1', lesson_title: 'ООП', block_no: '2', block_type: 'файл', block_title: 'Конспект', file_or_text: 'files/a.pdf', required: 'нет' },
    { module_no: '2', week: '3', module_title: 'Модуль 2', lesson_no: '1', lesson_title: 'Тест', block_no: '1', block_type: 'тест', block_title: 'Проверка', file_or_text: 'quizzes/q.xlsx', required: '' },
    { module_no: 'x', week: '1', module_title: '', lesson_no: '1', lesson_title: '', block_no: '1', block_type: 'text', block_title: '', file_or_text: 'hi', required: '' },
    { module_no: '2', week: '3', module_title: 'Модуль 2', lesson_no: '2', lesson_title: 'Б', block_no: '1', block_type: 'podcast', block_title: '', file_or_text: '', required: '' },
  ];
  it('строит дерево и находит ошибки по строкам', () => {
    const { modules, issues } = parseCourseTable(rows, ['Videos/OOP_M01_L01.mp4', 'quizzes/q.xlsx']);
    expect(modules).toHaveLength(2);
    expect(modules[0].lessons[0].blocks.map((b) => b.type)).toEqual(['video', 'file']);
    expect(modules[0].lessons[0].blocks[0].value).toBe('Videos/OOP_M01_L01.mp4');
    expect(modules[0].lessons[0].blocks[1].required).toBe(false);
    expect(modules[1].lessons[0].blocks[0].required).toBe(true);
    expect(issues).toEqual(
      expect.arrayContaining([
        { row: 3, code: 'missingFile', params: { file: 'files/a.pdf' } },
        { row: 5, code: 'badNumber', params: { column: 'module_no' } },
        { row: 6, code: 'badType', params: { value: 'podcast' } },
      ]),
    );
  });
});

describe('тесты из Excel', () => {
  it('разбирает все пять типов и сообщает об ошибках', () => {
    const { questions, errors } = parseQuizRows([
      { type: 'single', question: 'Q1', difficulty: '1', a: 'x', b: 'y', correct: 'b' },
      { question: 'Q2', difficulty: '2', a: 'x', b: 'y', c: 'z', correct: 'a,c' },
      { question: 'Q3', a: 'Класс = Шаблон', b: 'Объект = Экземпляр' },
      { type: 'порядок', question: 'Q4', a: '1', b: '2', c: '3' },
      { type: 'short', question: 'Q5', correct: 'метод; method' },
      { question: 'Q6', a: 'x', b: 'y', correct: 'z' },
      { type: 'single', question: 'Q7', a: 'x' },
    ]);
    expect(questions.map((q) => q.type)).toEqual(['single', 'multiple', 'matching', 'ordering', 'short']);
    expect(questions[0].options.map((o) => o.isCorrect)).toEqual([false, true]);
    expect(questions[2].options[0]).toEqual({ text: 'Класс', isCorrect: true, matchText: 'Шаблон' });
    expect(questions[4].answers).toEqual(['метод', 'method']);
    expect(errors).toEqual([
      { row: 7, code: 'badCorrect' },
      { row: 8, code: 'noOptions' },
    ]);
  });
});

describe('значения из Platonus на трёх языках', () => {
  it('форма, язык обучения, вид занятия', () => {
    expect(parseStudyForm('Очная')).toBe('full_time');
    expect(parseStudyForm('сырттай')).toBe('part_time');
    expect(parseLang('каз')).toBe('kk');
    expect(parseLang('Русский')).toBe('ru');
    expect(parseLessonType('Лабораторная')).toBe('lab');
    expect(parseLessonType('СРОП')).toBe('srop');
    expect(parseLessonType('???')).toBeNull();
  });
});
