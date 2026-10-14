import { describe, expect, it } from 'vitest';
import { attemptScore, optionOrder, pickQuestions, scoreAnswer, type QQuestion } from '@/lib/rules/quiz';

const opt = (id: string, isCorrect: boolean, position: number, matchText: string | null = null) => ({ id, text: id, isCorrect, position, matchText });
const q = (type: QQuestion['type'], options: QQuestion['options'], data: QQuestion['data'] = {}): QQuestion => ({ id: 'q', type, difficulty: 1, data, options });

describe('подсчёт баллов теста', () => {
  it('один ответ', () => {
    const x = q('single', [opt('a', true, 0), opt('b', false, 1)]);
    expect(scoreAnswer(x, { option: 'a' })).toBe(1);
    expect(scoreAnswer(x, { option: 'b' })).toBe(0);
    expect(scoreAnswer(x, null)).toBe(0);
  });
  it('несколько ответов: частичный балл, лишние снижают', () => {
    const x = q('multiple', [opt('a', true, 0), opt('b', true, 1), opt('c', false, 2)]);
    expect(scoreAnswer(x, { options: ['a', 'b'] })).toBe(1);
    expect(scoreAnswer(x, { options: ['a'] })).toBe(0.5);
    expect(scoreAnswer(x, { options: ['a', 'c'] })).toBe(0);
    expect(scoreAnswer(x, { options: ['a', 'b', 'c'] })).toBe(0.5);
  });
  it('соответствие и порядок — доля верных', () => {
    const m = q('matching', [opt('a', true, 0, 'A'), opt('b', true, 1, 'B')]);
    expect(scoreAnswer(m, { pairs: { a: 'a', b: 'a' } })).toBe(0.5);
    const o = q('ordering', [opt('x', true, 0), opt('y', true, 1), opt('z', true, 2)]);
    expect(scoreAnswer(o, { order: ['x', 'y', 'z'] })).toBe(1);
    expect(scoreAnswer(o, { order: ['y', 'x', 'z'] })).toBeCloseTo(1 / 3);
  });
  it('короткий ответ: регистр, ё и точка в конце не важны', () => {
    const s = q('short', [], { answers: ['Метод', 'method'] });
    expect(scoreAnswer(s, { text: '  метод. ' })).toBe(1);
    expect(scoreAnswer(s, { text: 'METHOD' })).toBe(1);
    expect(scoreAnswer(s, { text: 'функция' })).toBe(0);
  });
  it('итог 0–100', () => {
    expect(attemptScore([1, 0.5, 0, 1])).toBe(62.5);
    expect(attemptScore([])).toBe(0);
  });
  it('выбор вопросов по сложности', () => {
    const pool = [1, 1, 1, 2, 2, 3].map((d, i) => ({ id: String(i), difficulty: d }));
    const picked = pickQuestions(pool, { easy: 2, medium: 5, hard: 1 }, () => 0.3);
    expect(picked.filter((p) => p.difficulty === 1)).toHaveLength(2);
    expect(picked.filter((p) => p.difficulty === 2)).toHaveLength(2);
    expect(picked.filter((p) => p.difficulty === 3)).toHaveLength(1);
  });
  it('«порядок» всегда перемешан, остальное — по настройке', () => {
    const o = q('ordering', [opt('x', true, 0), opt('y', true, 1), opt('z', true, 2)]);
    expect(optionOrder(o, false, () => 0)).not.toEqual(['x', 'y', 'z']);
    const s = q('single', [opt('a', true, 0), opt('b', false, 1)]);
    expect(optionOrder(s, false)).toEqual(['a', 'b']);
  });
});
