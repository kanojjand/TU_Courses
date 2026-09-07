import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkHonours,
  checkPromotion,
  summarizeTransfers,
  HONOURS_ALLOWED_LETTERS,
  HONOURS_MIN_GPA,
  type HonoursGradeEntry,
} from '../src/domain/honours';

/**
 * Диплом с отличием и переводной балл — F-ASM-07, F-ASM-09, правило R-18.
 * Четыре условия пункта 50 Типовых правил должны выполняться одновременно.
 */

const entry = (
  name: string,
  letter: string | null,
  over: Partial<HonoursGradeEntry> = {}
): HonoursGradeEntry => ({
  disciplineId: name,
  disciplineName: name,
  letter,
  cycle: 'BD',
  attemptNo: 1,
  retakeCount: 0,
  ...over,
});

const perfect = () => ({
  gpa: 3.8,
  finalAttestationLetter: 'A',
  entries: [entry('История Казахстана', 'A'), entry('Философия', 'B+'), entry('Археология', 'C+')],
});

describe('Диплом с отличием: все условия выполнены', () => {
  const r = checkHonours(perfect());

  it('выдаётся при одновременном выполнении четырёх условий', () => {
    assert.equal(r.eligible, true);
    assert.equal(r.conditions.length, 4);
    assert.ok(r.conditions.every((c) => c.met));
  });

  it('C+ входит в перечень допустимых оценок, C — нет', () => {
    // Перечень задан нормой буквально, а не порогом цифрового эквивалента
    assert.ok((HONOURS_ALLOWED_LETTERS as readonly string[]).includes('C+'));
    assert.ok(!(HONOURS_ALLOWED_LETTERS as readonly string[]).includes('C'));

    const withC = checkHonours({
      ...perfect(),
      entries: [entry('История Казахстана', 'A'), entry('Философия', 'C')],
    });
    assert.equal(withC.eligible, false);
    assert.equal(withC.conditions[0].met, false);
    assert.deepEqual(withC.blockingDisciplines, [{ disciplineName: 'Философия', letter: 'C' }]);
  });
});

describe('Диплом с отличием: условия по отдельности', () => {
  it('условие 1: оценка ниже C+ закрывает отличие', () => {
    const r = checkHonours({
      ...perfect(),
      entries: [entry('Философия', 'D')],
    });
    assert.equal(r.conditions[0].met, false);
    assert.match(r.conditions[0].detail, /Философия \(D\)/);
    assert.equal(r.eligible, false);
  });

  it('условие 2: GPA ниже 3,5', () => {
    const r = checkHonours({ ...perfect(), gpa: 3.49 });
    assert.equal(r.conditions[1].met, false);
    assert.equal(r.eligible, false);
    assert.equal(HONOURS_MIN_GPA, 3.5);
  });

  it('условие 2: ровно 3,5 проходит', () => {
    const r = checkHonours({ ...perfect(), gpa: 3.5 });
    assert.equal(r.conditions[1].met, true);
    assert.equal(r.eligible, true);
  });

  it('условие 3: итоговая аттестация на B+ не проходит', () => {
    const r = checkHonours({ ...perfect(), finalAttestationLetter: 'B+' });
    assert.equal(r.conditions[2].met, false);
    assert.equal(r.eligible, false);
  });

  it('условие 3: несданная итоговая аттестация закрывает отличие', () => {
    const r = checkHonours({ ...perfect(), finalAttestationLetter: null });
    assert.equal(r.conditions[2].met, false);
    assert.match(r.conditions[2].detail, /не сдана/);
  });

  it('условие 4: повторное изучение дисциплины закрывает отличие', () => {
    const r = checkHonours({
      ...perfect(),
      entries: [entry('Философия', 'A', { attemptNo: 2 })],
    });
    assert.equal(r.conditions[3].met, false);
    assert.match(r.conditions[3].detail, /Философия/);
  });

  it('условие 4: пересдача по FX тоже закрывает отличие', () => {
    // Норма говорит и о пересдачах, и о повторных сдачах итогового контроля
    const r = checkHonours({
      ...perfect(),
      entries: [entry('Философия', 'A', { retakeCount: 1 })],
    });
    assert.equal(r.conditions[3].met, false);
  });

  it('ДВО и итоговая аттестация в проверку оценок не входят', () => {
    const r = checkHonours({
      ...perfect(),
      entries: [
        entry('Философия', 'A'),
        entry('Дополнительный курс', 'D', { cycle: 'DVO' }),
        entry('Защита диплома', 'C', { cycle: 'IA' }),
      ],
    });
    assert.equal(r.conditions[0].met, true);
    assert.equal(r.eligible, true);
  });

  it('без единой оценки отличие не присуждается', () => {
    const r = checkHonours({ ...perfect(), entries: [] });
    assert.equal(r.conditions[0].met, false);
    assert.match(r.conditions[0].detail, /Нет итоговых оценок/);
  });
});

describe('Переводной балл (F-ASM-07)', () => {
  const base = { studyYear: 1, creditsEarned: 60, creditsPlanned: 60 };

  it('GPA не ниже порога переводит на следующий курс', () => {
    const r = checkPromotion({ ...base, gpa: 2.5, threshold: 2.0 });
    assert.equal(r.promoted, true);
    assert.equal(r.nextStudyYear, 2);
  });

  it('GPA ниже порога оставляет на курсе', () => {
    const r = checkPromotion({ ...base, gpa: 1.8, threshold: 2.0 });
    assert.equal(r.promoted, false);
    assert.equal(r.nextStudyYear, 1);
    assert.match(r.reason, /ниже переводного балла/);
  });

  it('порог задаётся вузом, а не константой', () => {
    assert.equal(checkPromotion({ ...base, gpa: 2.1, threshold: 2.0 }).promoted, true);
    assert.equal(checkPromotion({ ...base, gpa: 2.1, threshold: 2.5 }).promoted, false);
  });

  it('недобор кредитов показывается, но перевод не запрещает', () => {
    // Задолженность ликвидируется в летнем семестре
    const r = checkPromotion({ ...base, gpa: 3.0, threshold: 2.0, creditsEarned: 48 });
    assert.equal(r.promoted, true);
    assert.equal(r.creditsShortfall, 12);
    assert.match(r.reason, /летнем семестре/);
  });

  it('нерассчитанный GPA не переводит', () => {
    const r = checkPromotion({ ...base, gpa: null, threshold: 2.0 });
    assert.equal(r.promoted, false);
    assert.match(r.reason, /не рассчитан/);
  });
});

describe('Перезачёт кредитов (F-ASM-10)', () => {
  it('в итог входят только утверждённые перезачёты', () => {
    const s = summarizeTransfers([
      { credits: 5, gpaPoint: 3.0, approved: true },
      { credits: 4, gpaPoint: 3.5, approved: false },
    ]);
    assert.equal(s.creditsApproved, 5);
  });

  it('дисциплина без цифрового эквивалента в GPA не попадает', () => {
    // Транскрипты сторонних организаций не всегда содержат эквивалент;
    // подставлять ноль нельзя — это занизило бы GPA
    const s = summarizeTransfers([
      { credits: 5, gpaPoint: 3.0, approved: true },
      { credits: 4, gpaPoint: null, approved: true },
    ]);
    assert.equal(s.creditsApproved, 9);
    assert.equal(s.creditsInGpa, 5);
    assert.equal(s.weightedPoints, 15);
  });

  it('пустой список даёт нули, а не ошибку', () => {
    assert.deepEqual(summarizeTransfers([]), {
      creditsApproved: 0,
      creditsInGpa: 0,
      weightedPoints: 0,
    });
  });
});
