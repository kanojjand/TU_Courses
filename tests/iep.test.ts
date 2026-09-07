import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIepPlan,
  creditsInYear,
  slotsForYear,
  termsForCourse,
  nextAttemptNo,
  placeRegistration,
  isWindowOpen,
  checkPeriodDuration,
  type IepSlotSpec,
  type IepContext,
} from '../src/domain/iep';
import { CURRICULUM_6B01601 } from '../src/server/seed/curriculum-6b01601';

/**
 * ИУП и регистрация — раздел 4.4 ТЗ.
 * Правила R-09 (годовая нагрузка), R-13 (выбор из элективной группы),
 * R-14 (пререквизиты), R-16 (попытки), R-10 (длительность периода).
 */

/** Позиции пилотного плана 6В01601 в виде, который принимает мастер ИУП */
function pilotSlots(prerequisites: Record<string, string[]> = {}): IepSlotSpec[] {
  return CURRICULUM_6B01601.slots.map((s, i) => ({
    id: `slot-${i}`,
    slotCode: s.slotCode,
    cycle: s.cycle,
    component: s.component,
    credits: s.credits,
    terms: s.terms,
    controlTerm: s.controlTerm,
    chooseN: s.chooseN,
    isMinorSlot: s.isMinorSlot,
    options: s.options.map((o) => ({
      disciplineId: o.code,
      code: o.code,
      name: o.nameRu,
      prerequisiteIds: prerequisites[o.code] ?? [],
    })),
  }));
}

function context(overrides: Partial<IepContext> = {}): IepContext {
  return {
    terms: [1, 2],
    completedDisciplineIds: [],
    failedDisciplineIds: [],
    limits: { normCredits: 60, minCredits: null, maxCredits: null },
    ...overrides,
  };
}

describe('Отбор позиций плана по учебному году', () => {
  const slots = pilotSlots();

  it('первый курс — только позиции семестров 1 и 2', () => {
    const first = slotsForYear(slots, [1, 2]);
    assert.ok(first.length > 0);
    assert.ok(first.every((s) => s.terms.some((t) => t === 1 || t === 2)));
  });

  it('физкультура попадает и в первый курс, и во второй', () => {
    const pe = slots.find((s) => s.slotCode === '1(2)107');
    assert.ok(pe, 'позиция физкультуры не найдена');
    assert.deepEqual(pe.terms, [1, 2, 3, 4]);
    assert.ok(slotsForYear(slots, [1, 2]).includes(pe));
    assert.ok(slotsForYear(slots, [3, 4]).includes(pe));
  });

  it('кредиты многосеместровой позиции делятся между годами', () => {
    const pe = slots.find((s) => s.slotCode === '1(2)107')!;
    // 8 кредитов за четыре семестра: по 4 на каждый учебный год
    assert.equal(pe.credits, 8);
    assert.equal(creditsInYear(pe, [1, 2]), 4);
    assert.equal(creditsInYear(pe, [3, 4]), 4);
    assert.equal(creditsInYear(pe, [5, 6]), 0);
  });

  it('порядковые семестры выводятся из курса обучения', () => {
    assert.deepEqual(termsForCourse(1), [1, 2]);
    assert.deepEqual(termsForCourse(2), [3, 4]);
    assert.deepEqual(termsForCourse(4), [7, 8]);
  });
});

describe('Мастер ИУП на плане 6В01601', () => {
  const slots = pilotSlots();

  it('обязательные позиции подставляются автоматически (F-IEP-01)', () => {
    const plan = buildIepPlan(slots, [], context());
    const automatic = plan.offers.filter((o) => o.isAutomatic);
    assert.ok(automatic.length > 0);
    // «История Казахстана» и языки выбора не требуют
    assert.ok(
      automatic.some((o) => o.slot.slotCode === '1105'),
      'казахский (русский) язык должен подставляться автоматически'
    );
    assert.ok(automatic.every((o) => o.slot.component !== 'KV'));
  });

  it('элективные позиции требуют выбора и считают, сколько осталось (R-13)', () => {
    const plan = buildIepPlan(slots, [], context());
    const elective = plan.offers.filter((o) => !o.isAutomatic);
    assert.ok(elective.length > 0, 'на первом курсе есть позиции по выбору');
    assert.ok(elective.every((o) => o.toChoose === o.slot.chooseN));
    assert.ok(plan.issues.some((i) => i.rule === 'R-13' && i.level === 'ERROR'));
    assert.equal(plan.valid, false);
  });

  it('полный выбор закрывает R-13 и даёт ровно 60 кредитов за первый курс', () => {
    const plan0 = buildIepPlan(slots, [], context());
    const selections = plan0.offers
      .filter((o) => !o.isAutomatic)
      .map((o) => ({ slotId: o.slot.id, disciplineId: o.options[0].disciplineId }));

    const plan = buildIepPlan(slots, selections, context());
    assert.ok(
      !plan.issues.some((i) => i.rule === 'R-13'),
      'после выбора замечаний R-13 быть не должно'
    );
    assert.equal(plan.selectedCredits, 60);
    assert.ok(
      !plan.issues.some((i) => i.rule === 'R-09'),
      'при 60 кредитах предупреждения о нагрузке нет'
    );
    assert.equal(plan.valid, true);
  });

  it('второй курс тоже даёт 60 кредитов', () => {
    const ctx = context({ terms: [3, 4] });
    const plan0 = buildIepPlan(slots, [], ctx);
    const selections = plan0.offers
      .filter((o) => !o.isAutomatic)
      .map((o) => ({ slotId: o.slot.id, disciplineId: o.options[0].disciplineId }));
    const plan = buildIepPlan(slots, selections, ctx);
    assert.equal(plan.selectedCredits, 60);
    assert.equal(plan.valid, true);
  });
});

describe('Проверки ИУП', () => {
  it('R-14: дисциплина недоступна без освоенных пререквизитов', () => {
    // «Археология Казахстана» требует «Древней истории Казахстана»
    const slots = pilotSlots({ 'KA/ AK/ AK 1217': ['KTT/ DIK/ AHK 1209'] });
    const plan = buildIepPlan(slots, [], context());
    const slot = plan.offers.find((o) => o.slot.slotCode === '1217');
    assert.ok(slot);
    const blocked = slot.options.find((o) => o.code === 'KA/ AK/ AK 1217');
    assert.ok(blocked);
    assert.equal(blocked.available, false);
    assert.match(blocked.blockedReason ?? '', /пререквизит/);
  });

  it('R-14: выбор недоступной дисциплины блокирует ИУП', () => {
    const slots = pilotSlots({ 'KA/ AK/ AK 1217': ['KTT/ DIK/ AHK 1209'] });
    const plan0 = buildIepPlan(slots, [], context());
    const slot = plan0.offers.find((o) => o.slot.slotCode === '1217')!;
    const plan = buildIepPlan(
      slots,
      [{ slotId: slot.slot.id, disciplineId: 'KA/ AK/ AK 1217' }],
      context()
    );
    assert.ok(plan.issues.some((i) => i.rule === 'R-14' && i.level === 'ERROR'));
    assert.equal(plan.valid, false);
  });

  it('R-14: с освоенным пререквизитом дисциплина доступна', () => {
    const slots = pilotSlots({ 'KA/ AK/ AK 1217': ['KTT/ DIK/ AHK 1209'] });
    const plan = buildIepPlan(
      slots,
      [],
      context({ completedDisciplineIds: ['KTT/ DIK/ AHK 1209'] })
    );
    const slot = plan.offers.find((o) => o.slot.slotCode === '1217')!;
    const option = slot.options.find((o) => o.code === 'KA/ AK/ AK 1217')!;
    assert.equal(option.available, true);
    assert.equal(option.blockedReason, null);
  });

  it('освоенная дисциплина недоступна к повторному выбору', () => {
    const slots = pilotSlots();
    const plan = buildIepPlan(
      slots,
      [],
      context({ completedDisciplineIds: ['Arh/ Arh/ Arch 1217'] })
    );
    const option = plan.offers
      .find((o) => o.slot.slotCode === '1217')!
      .options.find((o) => o.code === 'Arh/ Arh/ Arch 1217')!;
    assert.equal(option.available, false);
    assert.equal(option.blockedReason, 'Дисциплина уже освоена');
  });

  it('дисциплина с оценкой F доступна для повторного изучения (R-16)', () => {
    const slots = pilotSlots();
    const plan = buildIepPlan(
      slots,
      [],
      context({
        completedDisciplineIds: ['Arh/ Arh/ Arch 1217'],
        failedDisciplineIds: ['Arh/ Arh/ Arch 1217'],
      })
    );
    const option = plan.offers
      .find((o) => o.slot.slotCode === '1217')!
      .options.find((o) => o.code === 'Arh/ Arh/ Arch 1217')!;
    assert.equal(option.available, true);
    assert.equal(option.needsRetake, true);
  });

  it('R-09: отклонение от 60 кредитов даёт предупреждение, но не запрет', () => {
    const slots = pilotSlots();
    const plan = buildIepPlan(slots, [], context({ terms: [1, 2] }));
    // Без выбора элективов нагрузка меньше 60
    const warning = plan.issues.find((i) => i.rule === 'R-09');
    assert.ok(warning);
    assert.equal(warning.level, 'WARNING');
  });

  it('жёсткий максимум кредитов блокирует ИУП (F-IEP-02)', () => {
    const slots = pilotSlots();
    const plan0 = buildIepPlan(slots, [], context());
    const selections = plan0.offers
      .filter((o) => !o.isAutomatic)
      .map((o) => ({ slotId: o.slot.id, disciplineId: o.options[0].disciplineId }));
    const plan = buildIepPlan(
      slots,
      selections,
      context({ limits: { normCredits: 60, minCredits: null, maxCredits: 50 } })
    );
    assert.ok(plan.issues.some((i) => i.rule === 'I-MAX-CREDITS' && i.level === 'ERROR'));
    assert.equal(plan.valid, false);
  });

  it('жёсткий минимум кредитов блокирует ИУП', () => {
    const slots = pilotSlots();
    const plan = buildIepPlan(
      slots,
      [],
      context({ limits: { normCredits: 60, minCredits: 55, maxCredits: null } })
    );
    assert.ok(plan.issues.some((i) => i.rule === 'I-MIN-CREDITS'));
  });

  it('пустой год обучения сообщает о причине, а не молча даёт нулевой ИУП', () => {
    const plan = buildIepPlan(pilotSlots(), [], context({ terms: [99] }));
    assert.ok(plan.issues.some((i) => i.rule === 'I-EMPTY' && i.level === 'ERROR'));
    assert.equal(plan.valid, false);
  });
});

describe('Регистрация на реализации дисциплин', () => {
  it('F-IEP-05: при свободной квоте студент регистрируется', () => {
    const r = placeRegistration({ capacity: 25, registeredCount: 10, waitlistCount: 0 });
    assert.deepEqual(r, { status: 'REGISTERED', waitlistPos: null });
  });

  it('F-IEP-05: при исчерпанной квоте студент попадает в лист ожидания', () => {
    const r = placeRegistration({ capacity: 25, registeredCount: 25, waitlistCount: 3 });
    assert.deepEqual(r, { status: 'WAITLISTED', waitlistPos: 4 });
  });

  it('без квоты ограничения нет', () => {
    const r = placeRegistration({ capacity: null, registeredCount: 500, waitlistCount: 0 });
    assert.equal(r.status, 'REGISTERED');
  });

  it('R-16: номер попытки растёт при повторном изучении', () => {
    assert.equal(nextAttemptNo([]), 1);
    assert.equal(nextAttemptNo([{ attemptNo: 1 }]), 2);
    assert.equal(nextAttemptNo([{ attemptNo: 1 }, { attemptNo: 2 }]), 3);
  });

  it('F-ACAD-03: окно регистрации открыто только в свои даты', () => {
    const w = { opensAt: new Date('2026-08-01T00:00:00Z'), closesAt: new Date('2026-08-20T23:59:59Z') };
    assert.equal(isWindowOpen(w, new Date('2026-08-10T12:00:00Z')), true);
    assert.equal(isWindowOpen(w, new Date('2026-07-31T12:00:00Z')), false);
    assert.equal(isWindowOpen(w, new Date('2026-08-21T12:00:00Z')), false);
    assert.equal(isWindowOpen(null), false);
  });
});

describe('R-10: длительность академического периода', () => {
  const dates = (weeks: number) => ({
    startDate: new Date('2026-09-01'),
    endDate: new Date(new Date('2026-09-01').getTime() + weeks * 7 * 24 * 3600 * 1000),
  });

  it('семестр короче 15 недель не проходит', () => {
    const issue = checkPeriodDuration({ type: 'SEMESTER', weeksCount: 14, ...dates(14) });
    assert.ok(issue);
    assert.equal(issue.rule, 'R-10');
    assert.match(issue.message, /не менее 15/);
  });

  it('семестр в 15 недель проходит', () => {
    assert.equal(checkPeriodDuration({ type: 'SEMESTER', weeksCount: 15, ...dates(15) }), null);
  });

  it('триместр нормируется десятью неделями, квартал — семью', () => {
    assert.ok(checkPeriodDuration({ type: 'TRIMESTER', weeksCount: 9, ...dates(9) }));
    assert.equal(checkPeriodDuration({ type: 'TRIMESTER', weeksCount: 10, ...dates(10) }), null);
    assert.ok(checkPeriodDuration({ type: 'QUARTER', weeksCount: 6, ...dates(6) }));
    assert.equal(checkPeriodDuration({ type: 'QUARTER', weeksCount: 7, ...dates(7) }), null);
  });

  it('летний семестр нормативом не ограничен', () => {
    assert.equal(checkPeriodDuration({ type: 'SUMMER', weeksCount: 4, ...dates(4) }), null);
  });

  it('без явного числа недель длительность считается по датам', () => {
    assert.ok(checkPeriodDuration({ type: 'SEMESTER', weeksCount: null, ...dates(12) }));
    assert.equal(checkPeriodDuration({ type: 'SEMESTER', weeksCount: null, ...dates(16) }), null);
  });
});
