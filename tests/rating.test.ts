import { describe, expect, it } from 'vitest';
import { rkAdmission } from '@/lib/rules/admission';
import { admissionRating, componentScores } from '@/lib/rules/rating';

const scheme = { currentWeight: 0.6, admissionThreshold: 50, rkMinScore: 0 };

describe('рейтинг допуска', () => {
  it('балл компонента — среднее по элементам, пустой компонент — null', () => {
    const items = [
      { id: 'a', component: 'TK1' as const },
      { id: 'b', component: 'TK1' as const },
      { id: 'c', component: 'RK1' as const },
    ];
    const s = componentScores(items, new Map([['a', 80]]));
    expect(s.TK1).toBe(40);
    expect(s.RK1).toBeNull();
    expect(s.EXAM).toBeNull();
  });
  it('РД = (R1 + R2) / 2, R = ТК·w + РК·(1−w)', () => {
    const r = admissionRating({ TK1: 80, RK1: 70, TK2: 90, RK2: 60, EXAM: null }, scheme);
    expect(r.r1).toBe(76);
    expect(r.r2).toBe(78);
    expect(r.rating).toBe(77);
    expect(r.admitted).toBe(true);
  });
  it('ниже порога — нет допуска; минимальный РК тоже проверяется', () => {
    expect(admissionRating({ TK1: 40, RK1: 40, TK2: 40, RK2: 40, EXAM: null }, scheme).admitted).toBe(false);
    expect(admissionRating({ TK1: 100, RK1: 20, TK2: 100, RK2: 100, EXAM: null }, { ...scheme, rkMinScore: 25 }).admitted).toBe(false);
  });
});

describe('допуск к РК (5.3, п. 4)', () => {
  const lessons = [
    { id: 'l1', week: 1, required: true },
    { id: 'l2', week: 5, required: true },
    { id: 'l3', week: 9, required: true },
    { id: 'l4', week: 2, required: false },
  ];
  const videos = [
    { blockId: 'v1', lessonId: 'l1', week: 1, required: true },
    { blockId: 'v3', lessonId: 'l3', week: 9, required: true },
  ];
  it('учитываются только обязательные уроки до недели РК и видео ≥ порога', () => {
    const r = rkAdmission({ rkWeek: 7, lessons, completedLessonIds: new Set(['l1', 'l2']), videos, videoPercent: new Map([['v1', 92]]), videoThreshold: 90 });
    expect(r).toMatchObject({ admitted: true, missingLessons: 0, missingVideos: 0, totalLessons: 2, totalVideos: 1 });
    const r2 = rkAdmission({ rkWeek: 7, lessons, completedLessonIds: new Set(['l1']), videos, videoPercent: new Map([['v1', 89]]), videoThreshold: 90 });
    expect(r2).toMatchObject({ admitted: false, missingLessons: 1, missingVideos: 1 });
  });
});
