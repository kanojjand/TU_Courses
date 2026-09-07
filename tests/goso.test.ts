import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarize,
  validateCurriculum,
  buildCompliance,
  type GosoProfileSpec,
  type SlotSpec,
} from '../src/domain/goso';
import { GOSO_PROFILES, GOSO_MANDATORY } from '../src/server/seed/goso';
import { CURRICULUM_6B01601 } from '../src/server/seed/curriculum-6b01601';

/**
 * Валидатор ГОСО — критерий приёмки № 1 раздела 8.1 ТЗ:
 * план 6В01601 заведён полностью и валидатор подтверждает
 * ООД 56 (51 ОК + 5 ВК), БД + ПД 176, ИА 8, итого 240 кредитов и 7200 часов.
 */

/** Профиль бакалавриата на 240 кредитов вместе с обязательными дисциплинами */
function profile240(): GosoProfileSpec {
  const p = GOSO_PROFILES.find((x) => x.code === 'BACHELOR_240');
  assert.ok(p, 'профиль BACHELOR_240 отсутствует в справочнике');
  return {
    code: p.code,
    totalCredits: p.totalCredits,
    totalHoursMin: p.totalHoursMin,
    hoursPerCredit: p.hoursPerCredit,
    oodCredits: p.oodCredits,
    oodOkCredits: p.oodOkCredits,
    oodVkKvCredits: p.oodVkKvCredits,
    bdPdCreditsMin: p.bdPdCreditsMin,
    finalCertCreditsMin: p.finalCertCreditsMin,
    yearCreditsNorm: p.yearCreditsNorm,
    mandatory: GOSO_MANDATORY.map((m) => ({
      slug: m.slug,
      nameRu: m.nameRu,
      credits: m.credits,
      hours: m.hours,
      controlForm: m.controlForm,
      isModule: m.isModule,
    })),
  };
}

/** Позиции пилотного плана в виде, который принимает валидатор */
function pilotSlots(): SlotSpec[] {
  return CURRICULUM_6B01601.slots.map((s, i) => ({
    id: `slot-${i}`,
    slotCode: s.slotCode,
    cycle: s.cycle,
    component: s.component,
    credits: s.credits,
    totalHours: s.totalHours,
    hoursLecture: s.hoursLecture,
    hoursLab: s.hoursLab,
    hoursPractice: s.hoursPractice,
    hoursIndividual: s.hoursIndividual,
    hoursSrs: s.hoursSrs,
    hoursSrsp: s.hoursSrsp,
    hoursPracticeField: s.hoursPracticeField,
    hoursThesis: s.hoursThesis,
    controlForm: s.controlForm,
    terms: s.terms,
    creditsByTerm: s.creditsByTerm,
    controlTerm: s.controlTerm,
    chooseN: s.chooseN,
    isMinorSlot: s.isMinorSlot,
    options: s.options.map((o, j) => ({
      disciplineId: `${i}-${j}`,
      nameRu: o.nameRu,
      gosoMandatorySlug: o.gosoMandatorySlug,
    })),
  }));
}

describe('Свод учебного плана 6В01601', () => {
  const totals = summarize(pilotSlots());

  it('содержит 47 позиций и 12 модулей', () => {
    assert.equal(CURRICULUM_6B01601.slots.length, 47);
    assert.equal(CURRICULUM_6B01601.modules.length, 12);
  });

  it('даёт нормативные объёмы ГОСО', () => {
    assert.equal(totals.credits, 240);
    assert.equal(totals.hours, 7200);
    assert.equal(totals.ood, 56);
    assert.equal(totals.oodOk, 51);
    assert.equal(totals.oodVkKv, 5);
    assert.equal(totals.bdPd, 176);
    assert.equal(totals.ia, 8);
  });

  it('учитывает 28 кредитов профессиональной практики (раздел 2.5)', () => {
    assert.equal(totals.practice, 28);
  });

  it('содержит три слота минора по 5 кредитов (F-CUR-04)', () => {
    assert.equal(totals.minor, 15);
    assert.equal(CURRICULUM_6B01601.slots.filter((s) => s.isMinorSlot).length, 3);
  });

  it('распределяет кредиты по восьми семестрам', () => {
    const terms = Object.keys(totals.byTerm).map(Number).sort((a, b) => a - b);
    assert.deepEqual(terms, [1, 2, 3, 4, 5, 6, 7, 8]);
    const sum = Object.values(totals.byTerm).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 240) < 0.01, `сумма по семестрам ${sum}`);
  });
});

describe('Валидатор ГОСО на эталонном плане', () => {
  const result = validateCurriculum(profile240(), pilotSlots());

  it('признаёт план соответствующим — блокирующих ошибок нет', () => {
    assert.equal(
      result.errors.length,
      0,
      'блокирующие ошибки: ' + result.errors.map((e) => `${e.rule}: ${e.message}`).join(' | ')
    );
    assert.equal(result.valid, true);
  });

  it('панель соответствия сходится по всем правилам (F-CUR-07)', () => {
    for (const row of result.compliance) {
      assert.equal(row.ok, true, `${row.rule} ${row.label}: ${row.actual} вместо ${row.required}`);
      if (!row.isMinimum) assert.equal(row.delta, 0, `${row.rule}: отклонение ${row.delta}`);
    }
  });

  it('находит расхождение семестра контроля, перенесённое из .xls', () => {
    // Позиция 3302 «Методика преподавания истории» читается в 5-м семестре,
    // а итоговый контроль в исходной форме проставлен на 6-й. Норматив этим
    // не нарушается, поэтому замечание не блокирует утверждение.
    const finding = result.warnings.find((w) => w.rule === 'C-CONTROL-TERM');
    assert.ok(finding, 'предупреждение о семестре контроля не найдено');
    assert.match(finding.message, /3302/);
  });
});

describe('Валидатор ГОСО ловит нарушения', () => {
  const profile = profile240();

  it('R-02: объём программы не равен норме профиля', () => {
    const slots = pilotSlots();
    slots[slots.length - 1].credits -= 3;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.rule === 'R-02'));
  });

  it('R-03 и R-04: сокращение обязательной дисциплины ООД', () => {
    const slots = pilotSlots();
    const history = slots.find((s) => s.options.some((o) => o.gosoMandatorySlug === 'history_kz'));
    assert.ok(history);
    history.credits = 3;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.rule === 'R-03'), 'не найдено нарушение объёма цикла ООД');
    assert.ok(
      r.errors.some((e) => e.rule === 'R-04' && /История Казахстана/.test(e.message)),
      'не найдено сокращение обязательной дисциплины'
    );
  });

  it('R-04: обязательная дисциплина отсутствует в плане', () => {
    const slots = pilotSlots().filter(
      (s) => !s.options.some((o) => o.gosoMandatorySlug === 'philosophy')
    );
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-04' && /Философия/.test(e.message)));
  });

  it('R-05: вузовский компонент цикла ООД не равен 5 кредитам', () => {
    const slots = pilotSlots();
    const vk = slots.find((s) => s.cycle === 'OOD' && s.component !== 'OK');
    assert.ok(vk);
    vk.credits = 7;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-05'));
  });

  it('R-06: циклы БД и ПД ниже минимума', () => {
    const slots = pilotSlots();
    const bd = slots.find((s) => s.cycle === 'BD');
    assert.ok(bd);
    bd.credits = 1;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-06'));
  });

  it('R-07: итоговая аттестация ниже 8 кредитов', () => {
    const slots = pilotSlots();
    for (const s of slots) if (s.cycle === 'IA') s.credits = 4;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-07'));
  });

  it('R-08: объём в часах ниже 7200', () => {
    const slots = pilotSlots();
    slots[0].totalHours = 0;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-08'));
  });

  it('R-01: часы позиции не равны кредитам × 30', () => {
    const slots = pilotSlots();
    slots[0].totalHours += 30;
    const strict = validateCurriculum(profile, slots, { strictHours: true });
    assert.ok(strict.errors.some((e) => e.rule === 'R-01'), 'при strictHours должно блокировать');

    const lenient = validateCurriculum(profile, slots);
    assert.ok(lenient.warnings.some((w) => w.rule === 'R-01'), 'по умолчанию — предупреждение');
    assert.ok(!lenient.errors.some((e) => e.rule === 'R-01'));
  });

  it('R-11: по «Истории Казахстана» назначен обычный экзамен', () => {
    const slots = pilotSlots();
    const history = slots.find((s) => s.options.some((o) => o.gosoMandatorySlug === 'history_kz'));
    assert.ok(history);
    history.controlForm = 'EXAM';
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.rule === 'R-11' && /государственный экзамен/.test(e.message)));
  });

  it('R-11: государственный экзамен назначен на другой академический период', () => {
    const slots = pilotSlots();
    const history = slots.find((s) => s.options.some((o) => o.gosoMandatorySlug === 'history_kz'));
    assert.ok(history);
    history.controlTerm = 8;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'R-11' && /том же периоде/.test(e.message)));
  });

  it('C-CHOOSE-N: выбрать нужно больше дисциплин, чем есть вариантов', () => {
    const slots = pilotSlots();
    slots[0].chooseN = 5;
    const r = validateCurriculum(profile, slots, { strictHours: false });
    assert.ok(r.errors.some((e) => e.rule === 'C-CHOOSE-N'));
  });
});

describe('Профили ГОСО', () => {
  it('справочник содержит все четыре профиля раздела 2.2', () => {
    const codes = GOSO_PROFILES.map((p) => p.code).sort();
    assert.deepEqual(codes, ['BACHELOR_240', 'BACHELOR_300', 'SPECIALIST_300', 'VSUZ_240']);
  });

  it('обязательный компонент ООД в сумме даёт 51 кредит (ГОСО, п. 6)', () => {
    const sum = GOSO_MANDATORY.reduce((a, m) => a + m.credits, 0);
    assert.equal(sum, 51);
    const hours = GOSO_MANDATORY.reduce((a, m) => a + m.hours, 0);
    assert.equal(hours, 1530);
  });

  it('профиль на 300 кредитов отличается только объёмом БД и ПД (раздел 2.2)', () => {
    const b240 = GOSO_PROFILES.find((p) => p.code === 'BACHELOR_240')!;
    const b300 = GOSO_PROFILES.find((p) => p.code === 'BACHELOR_300')!;
    assert.equal(b240.oodCredits, b300.oodCredits);
    assert.equal(b240.oodOkCredits, b300.oodOkCredits);
    assert.equal(b240.finalCertCreditsMin, b300.finalCertCreditsMin);
    assert.equal(b300.bdPdCreditsMin - b240.bdPdCreditsMin, 60);
    assert.equal(b300.totalCredits - b240.totalCredits, 60);
  });

  it('панель соответствия строится по профилю без плана', () => {
    const rows = buildCompliance(profile240(), summarize([]));
    assert.equal(rows.length, 7);
    assert.ok(rows.every((r) => !r.ok));
  });
});
