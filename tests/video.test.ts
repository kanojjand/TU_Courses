import { describe, expect, it } from 'vitest';
import { mergeSegments, normalizeSegments, plausibleIncoming, watchedPercent } from '@/lib/rules/video';

describe('учёт просмотра видео', () => {
  it('склеивает пересекающиеся и соседние отрезки без двойного счёта', () => {
    expect(normalizeSegments([[10, 20], [0, 5], [15, 30], [30.5, 40]])).toEqual([[0, 5], [10, 40]]);
    expect(mergeSegments([[0, 60]], [[30, 90]])).toEqual([[0, 90]]);
  });
  it('процент считается от длительности, перемотка не засчитывается', () => {
    expect(watchedPercent([[0, 54]], 60)).toBe(90);
    expect(watchedPercent([[0, 10], [50, 60]], 60)).toBe(33.3);
    expect(watchedPercent([[0, 10]], 0)).toBe(0);
  });
  it('обрезает отрезки по длительности и отбрасывает мусор', () => {
    expect(normalizeSegments([[-5, 10], [50, 200], [NaN, 3]], 60)).toEqual([[0, 10], [50, 60]]);
  });
  it('нельзя «посмотреть» больше, чем прошло времени (с запасом на скорость ×2.5)', () => {
    expect(plausibleIncoming([[0, 600]], 60)).toEqual([[0, 150]]);
    expect(plausibleIncoming([[0, 10], [20, 30]], 60)).toEqual([[0, 10], [20, 30]]);
  });
});
