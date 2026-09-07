import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlacement,
  checkAdmission,
  canScheduleAttestation,
  practiceCredits,
  canIssueDiploma,
  PRACTICE_KIND_LABELS,
  type AdmissionInput,
} from '../src/domain/attestation';

/**
 * Практика и итоговая аттестация — F-PRC-03, F-PRC-05, F-FIN-04, F-FIN-06, F-FIN-07.
 */

describe('Распределение на базу практики (F-PRC-03)', () => {
  it('свободных мест нет — распределение запрещено', () => {
    const issues = checkPlacement({
      majorProfile: null,
      hasMinor: false,
      baseProfile: null,
      freeCapacity: 0,
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].level, 'ERROR');
  });

  it('без вместимости ограничения нет', () => {
    const issues = checkPlacement({
      majorProfile: null,
      hasMinor: false,
      baseProfile: null,
      freeCapacity: null,
    });
    assert.deepEqual(issues, []);
  });

  it('без Minor профиль базы не проверяется', () => {
    const issues = checkPlacement({
      majorProfile: 'подготовка учителей истории',
      hasMinor: false,
      baseProfile: 'ветеринарная клиника',
      freeCapacity: 5,
    });
    assert.deepEqual(issues, []);
  });

  it('при Minor несовпадение профиля даёт предупреждение, а не запрет', () => {
    // Формулировки профилей в договорах не унифицированы, и жёсткий запрет
    // заблокировал бы распределение
    const issues = checkPlacement({
      majorProfile: 'подготовка учителей истории',
      hasMinor: true,
      baseProfile: 'ветеринарная клиника',
      freeCapacity: 5,
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].level, 'WARNING');
    assert.match(issues[0].message, /профилю Major/);
  });

  it('при Minor совпадение профиля замечаний не даёт', () => {
    const issues = checkPlacement({
      majorProfile: 'история',
      hasMinor: true,
      baseProfile: 'школа-гимназия, преподавание истории',
      freeCapacity: 5,
    });
    assert.deepEqual(issues, []);
  });

  it('незаполненный профиль отмечается предупреждением', () => {
    const issues = checkPlacement({
      majorProfile: null,
      hasMinor: true,
      baseProfile: 'школа',
      freeCapacity: 5,
    });
    assert.equal(issues[0].level, 'WARNING');
    assert.match(issues[0].message, /не заполнен/);
  });
});

describe('Кредиты практики (F-PRC-05)', () => {
  it('засчитываются только оценённые практики', () => {
    const credits = practiceCredits([
      { credits: 2, status: 'GRADED' },
      { credits: 4, status: 'IN_PROGRESS' },
      { credits: 8, status: 'GRADED' },
      { credits: 12, status: 'CANCELLED' },
    ]);
    assert.equal(credits, 10);
  });

  it('пустой список даёт ноль', () => {
    assert.equal(practiceCredits([]), 0);
  });
});

describe('Допуск к итоговой аттестации (F-FIN-04)', () => {
  const base = (over: Partial<AdmissionInput> = {}): AdmissionInput => ({
    creditsEarned: 232,
    creditsRequired: 240,
    finalCertCredits: 8,
    failedDisciplines: [],
    unfinishedPractices: [],
    form: 'COMPLEX_EXAM',
    thesisStatus: null,
    ...over,
  });

  it('полный объём без задолженностей даёт допуск', () => {
    const r = checkAdmission(base());
    assert.equal(r.admitted, true);
    assert.equal(r.creditsShortfall, 0);
  });

  it('кредиты итоговой аттестации из требуемого объёма вычитаются', () => {
    // Иначе до допуска их взять неоткуда и не допущен был бы никто
    const r = checkAdmission(base({ creditsEarned: 232, creditsRequired: 240 }));
    assert.equal(r.conditions[0].met, true);
    assert.match(r.conditions[0].detail, /232 кредитов при требуемых 232/);
  });

  it('недобор кредитов закрывает допуск', () => {
    const r = checkAdmission(base({ creditsEarned: 220 }));
    assert.equal(r.admitted, false);
    assert.equal(r.creditsShortfall, 12);
    assert.match(r.conditions[0].detail, /Не хватает 12/);
  });

  it('академическая задолженность закрывает допуск', () => {
    const r = checkAdmission(base({ failedDisciplines: [{ name: 'Философия', letter: 'F' }] }));
    assert.equal(r.admitted, false);
    assert.match(r.conditions[1].detail, /Философия \(F\)/);
  });

  it('незавершённая практика закрывает допуск', () => {
    const r = checkAdmission(
      base({ unfinishedPractices: [{ kind: 'PRE_DIPLOMA', status: 'IN_PROGRESS' }] })
    );
    assert.equal(r.admitted, false);
    assert.match(r.conditions[2].detail, /преддипломная/);
  });

  it('для защиты нужна сданная дипломная работа', () => {
    const withoutThesis = checkAdmission(base({ form: 'THESIS_DEFENSE', thesisStatus: null }));
    assert.equal(withoutThesis.admitted, false);
    assert.match(withoutThesis.conditions[3].detail, /не закреплена/);

    const admitted = checkAdmission(base({ form: 'THESIS_DEFENSE', thesisStatus: 'ADMITTED' }));
    assert.equal(admitted.admitted, true);
  });

  it('для комплексного экзамена дипломная работа не требуется', () => {
    const r = checkAdmission(base({ form: 'COMPLEX_EXAM' }));
    assert.equal(r.conditions.length, 3);
    assert.equal(r.admitted, true);
  });
});

describe('Повторная итоговая аттестация (F-FIN-06)', () => {
  it('первая аттестация назначается', () => {
    assert.equal(canScheduleAttestation(null).allowed, true);
    assert.equal(canScheduleAttestation({ heldAt: null, isPassed: null }).allowed, true);
  });

  it('повторная сдача для повышения оценки не допускается', () => {
    const r = canScheduleAttestation({ heldAt: new Date('2026-06-01'), isPassed: true });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /повышения оценки/);
  });

  it('пересдача при «неудовлетворительно» не разрешается — отчисление', () => {
    const r = canScheduleAttestation({ heldAt: new Date('2026-06-01'), isPassed: false });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /отчисляется/);
  });
});

describe('Выдача диплома (F-FIN-07)', () => {
  it('без проведённой аттестации диплом не формируется', () => {
    assert.equal(canIssueDiploma(null).allowed, false);
  });

  it('несданная аттестация закрывает выдачу', () => {
    const r = canIssueDiploma({ isPassed: false, degreeAwarded: false, protocolNo: '12' });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /не сдана/);
  });

  it('нужен номер протокола заседания комиссии', () => {
    const r = canIssueDiploma({ isPassed: true, degreeAwarded: true, protocolNo: null });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /протокола/);
  });

  it('нужно решение о присуждении степени', () => {
    const r = canIssueDiploma({ isPassed: true, degreeAwarded: false, protocolNo: '12' });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? '', /присуждении степени/);
  });

  it('при выполнении всех условий диплом формируется', () => {
    const r = canIssueDiploma({ isPassed: true, degreeAwarded: true, protocolNo: '12' });
    assert.equal(r.allowed, true);
    assert.equal(r.reason, null);
  });
});

describe('Справочник видов практики (F-PRC-01)', () => {
  it('содержит все пять видов из пункта 37 Типовых правил', () => {
    assert.deepEqual(Object.keys(PRACTICE_KIND_LABELS).sort(), [
      'EDUCATIONAL',
      'PEDAGOGICAL',
      'PRE_DIPLOMA',
      'PRODUCTION',
      'RESEARCH',
    ]);
  });
});
