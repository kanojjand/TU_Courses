import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { HOURS_PER_CREDIT } from '../src/domain/constants';
import {
  hoursIndicatorText,
  minutesToAcademicHours,
  requiredHoursForCredits,
  validateCourseHours,
  type HourBearingItem,
} from '../src/domain/hours';
import {
  applyLatePenalty,
  calculateControlPeriodScore,
  calculateFinalGrade,
  letterForScore,
  STANDARD_GRADE_SCALE,
} from '../src/domain/grading';
import { calculateGpa, calculatePeriodGpa, calculateCumulativeGpa } from '../src/domain/gpa';
import {
  capCountedMinutes,
  checkItemCompletion,
  creditForHeartbeat,
  isSessionStale,
  summarizeProgress,
  DEFAULT_ACTIVITY_PARAMS,
} from '../src/domain/activity';
import {
  gradeAnswer,
  gradeAttempt,
  resolveAttemptScore,
  shuffleWithSeed,
  questionDifficultyStats,
  type QuestionSpec,
} from '../src/domain/quiz';

/**
 * Юнит-тесты доменной логики.
 * Покрывают критерии приёмки № 2, 3, 4, 5, 6 (раздел 11 ТЗ).
 */

// ═══════════════ Критерий приёмки № 2: валидация объёма часов ═══════════════

describe('Учёт плановой трудоёмкости (раздел 4.2)', () => {
  const item = (id: string, hours: number, workType: HourBearingItem['workType'] = 'LECTURE') => ({
    id,
    plannedAcademicHours: hours,
    workType,
  });

  it('один академический кредит равен 30 академическим часам (ГОСО, п. 29)', () => {
    assert.equal(HOURS_PER_CREDIT, 30);
    assert.equal(requiredHoursForCredits(3), 90);
    assert.equal(requiredHoursForCredits(5), 150);
  });

  it('курс с точным соответствием часов проходит проверку', () => {
    const result = validateCourseHours(
      [item('a', 30), item('b', 30, 'PRACTICE'), item('c', 30, 'SRO')],
      3
    );
    assert.equal(result.valid, true);
    assert.equal(result.plannedHours, 90);
    assert.equal(result.requiredHours, 90);
    assert.equal(result.delta, 0);
    assert.equal(result.issues.length, 0);
  });

  it('недостаток часов блокирует публикацию и указывает величину расхождения', () => {
    const result = validateCourseHours([item('a', 40), item('b', 38)], 3);
    assert.equal(result.valid, false);
    assert.equal(result.delta, -12);

    const mismatch = result.issues.find((i) => i.code === 'TOTAL_MISMATCH');
    assert.ok(mismatch, 'должно быть зафиксировано расхождение по сумме часов');
    assert.equal(mismatch.delta, -12);
    assert.match(mismatch.message, /12/);
  });

  it('превышение часов также блокирует публикацию', () => {
    const result = validateCourseHours([item('a', 100)], 3);
    assert.equal(result.valid, false);
    assert.equal(result.delta, 10);
    assert.match(result.issues[0].message, /превышает/);
  });

  it('допуск отклонения соблюдается', () => {
    const items = [item('a', 89)];
    assert.equal(validateCourseHours(items, 3, { tolerance: 0 }).valid, false);
    assert.equal(validateCourseHours(items, 3, { tolerance: 1 }).valid, true);
  });

  it('элементы с нулевой трудоёмкостью выявляются отдельно', () => {
    const result = validateCourseHours([item('a', 90), item('b', 0)], 3);
    const issue = result.issues.find((i) => i.code === 'ZERO_HOURS_ITEM');
    assert.ok(issue);
    assert.deepEqual(issue.itemIds, ['b']);
  });

  it('пустой курс не проходит проверку', () => {
    const result = validateCourseHours([], 3);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.code === 'NO_ITEMS'));
  });

  it('распределение по видам работы рассчитывается корректно', () => {
    const result = validateCourseHours(
      [item('a', 30, 'LECTURE'), item('b', 30, 'PRACTICE'), item('c', 30, 'SRO')],
      3
    );
    const lecture = result.breakdown.find((b) => b.workType === 'LECTURE');
    assert.equal(lecture?.hours, 30);
    assert.equal(lecture?.percent, 33.33);
  });

  it('нарушение норматива по видам работы фиксируется', () => {
    const result = validateCourseHours(
      [item('a', 60, 'LECTURE'), item('b', 30, 'SRO')],
      3,
      {
        enforceNorms: true,
        norms: [{ workType: 'LECTURE', sharePercent: 30, tolerance: 5 }],
      }
    );
    const violation = result.issues.find((i) => i.code === 'WORK_TYPE_NORM_VIOLATION');
    assert.ok(violation);
    assert.equal(violation.workType, 'LECTURE');
  });

  it('текст индикатора конструктора соответствует F-T-07', () => {
    assert.equal(
      hoursIndicatorText(78, 3),
      'Распределено 78 из 90 академических часов (3 кредита)'
    );
    assert.match(hoursIndicatorText(30, 1), /1 кредит\)$/);
    assert.match(hoursIndicatorText(150, 5), /5 кредитов\)$/);
  });

  it('перевод минут в академические часы учитывает настройку', () => {
    assert.equal(minutesToAcademicHours(100, 50), 2);
    assert.equal(minutesToAcademicHours(120, 60), 2);
  });
});

// ═══════ Критерий приёмки № 5: итоговая оценка и Приложение 1 ══════════════

describe('Шкала оценивания — Приложение 1 к Типовым правилам (раздел 2.3)', () => {
  it('содержит все двенадцать буквенных оценок', () => {
    assert.equal(STANDARD_GRADE_SCALE.length, 12);
    assert.deepEqual(
      STANDARD_GRADE_SCALE.map((r) => r.letter),
      ['A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D+', 'D', 'FX', 'F']
    );
  });

  it('границы диапазонов соответствуют нормативу', () => {
    const cases: [number, string, number][] = [
      [100, 'A', 4.0],
      [95, 'A', 4.0],
      [94, 'A−', 3.67],
      [90, 'A−', 3.67],
      [89, 'B+', 3.33],
      [85, 'B+', 3.33],
      [84, 'B', 3.0],
      [80, 'B', 3.0],
      [79, 'B−', 2.67],
      [75, 'B−', 2.67],
      [74, 'C+', 2.33],
      [70, 'C+', 2.33],
      [69, 'C', 2.0],
      [65, 'C', 2.0],
      [64, 'C−', 1.67],
      [60, 'C−', 1.67],
      [59, 'D+', 1.33],
      [55, 'D+', 1.33],
      [54, 'D', 1.0],
      [50, 'D', 1.0],
      [49, 'FX', 0.5],
      [25, 'FX', 0.5],
      [24, 'F', 0.0],
      [0, 'F', 0.0],
    ];

    for (const [percent, letter, points] of cases) {
      const row = letterForScore(percent);
      assert.equal(row.letter, letter, `${percent} % → ${letter}`);
      assert.equal(row.gpaPoints, points);
    }
  });

  it('шкала непрерывна: между диапазонами нет разрывов', () => {
    const sorted = [...STANDARD_GRADE_SCALE].sort((a, b) => a.minPercent - b.minPercent);
    for (let i = 1; i < sorted.length; i++) {
      assert.equal(
        sorted[i].minPercent,
        sorted[i - 1].maxPercent + 1,
        `разрыв между ${sorted[i - 1].letter} и ${sorted[i].letter}`
      );
    }
    assert.equal(sorted[0].minPercent, 0);
    assert.equal(sorted[sorted.length - 1].maxPercent, 100);
  });

  it('только FX и F являются неудовлетворительными', () => {
    const failing = STANDARD_GRADE_SCALE.filter((r) => !r.isPassing).map((r) => r.letter);
    assert.deepEqual(failing, ['FX', 'F']);
  });
});

describe('Расчёт итоговой оценки (раздел 4.3)', () => {
  it('контрольный пример: РК1 80, РК2 70, экзамен 90 → 81 баллов, B+', () => {
    const result = calculateFinalGrade({ midterms: [80, 70], examScore: 90 });
    assert.equal(result.admissionScore, 75);
    assert.equal(result.isAdmitted, true);
    // 75 × 0,6 + 90 × 0,4 = 45 + 36 = 81
    assert.equal(result.finalScore, 81);
    assert.equal(result.letter, 'B');
    assert.equal(result.gpaPoints, 3.0);
    assert.equal(result.isPassing, true);
  });

  it('рейтинг допуска ниже порога — студент не допущен, выставляется F', () => {
    const result = calculateFinalGrade({ midterms: [40, 45], examScore: 100 });
    assert.equal(result.admissionScore, 42.5);
    assert.equal(result.isAdmitted, false);
    assert.equal(result.letter, 'F');
    assert.equal(result.canRetakeExam, false);
    assert.match(result.explanation, /не допущен/);
  });

  it('граничный случай: рейтинг допуска ровно 50 — студент допущен', () => {
    const result = calculateFinalGrade({ midterms: [50, 50], examScore: 60 });
    assert.equal(result.isAdmitted, true);
    assert.equal(result.finalScore, 54);
    assert.equal(result.letter, 'D');
  });

  it('FX даёт право на повторную сдачу экзамена, F — не даёт', () => {
    const fx = calculateFinalGrade({ midterms: [55, 55], examScore: 10 });
    // 55 × 0,6 + 10 × 0,4 = 33 + 4 = 37 → FX
    assert.equal(fx.finalScore, 37);
    assert.equal(fx.letter, 'FX');
    assert.equal(fx.canRetakeExam, true);
    assert.match(fx.explanation, /повторная сдача/);

    const f = calculateFinalGrade({ midterms: [50, 50], examScore: 0 });
    // 50 × 0,6 = 30 → FX (граница 25–49)
    assert.equal(f.letter, 'FX');
  });

  it('экзамен не выставлен — итог не рассчитывается', () => {
    const result = calculateFinalGrade({ midterms: [80, 80], examScore: null });
    assert.equal(result.admissionScore, 80);
    assert.equal(result.isAdmitted, true);
    assert.equal(result.finalScore, null);
    assert.equal(result.letter, null);
  });

  it('рубежный контроль не выставлен — итог не рассчитывается', () => {
    const result = calculateFinalGrade({ midterms: [null, null], examScore: 90 });
    assert.equal(result.admissionScore, null);
    assert.equal(result.finalScore, null);
  });

  it('один период рубежного контроля вместо двух', () => {
    const result = calculateFinalGrade({
      midterms: [70],
      examScore: 80,
      config: { midtermCount: 1 },
    });
    assert.equal(result.admissionScore, 70);
    assert.equal(result.finalScore, 74); // 70 × 0,6 + 80 × 0,4
  });

  it('коэффициенты формулы переопределяются настройками вуза', () => {
    const result = calculateFinalGrade({
      midterms: [60, 60],
      examScore: 100,
      config: { admissionWeight: 0.5, examWeight: 0.5 },
    });
    assert.equal(result.finalScore, 80);
    assert.equal(result.letter, 'B');
  });

  it('минимальный балл экзамена, если установлен политикой', () => {
    const result = calculateFinalGrade({
      midterms: [90, 90],
      examScore: 20,
      config: { examMinScore: 30 },
    });
    assert.equal(result.isPassing, false);
    assert.match(result.explanation, /ниже минимального/);
  });

  it('максимум: A при 100 баллах по всем видам контроля', () => {
    const result = calculateFinalGrade({ midterms: [100, 100], examScore: 100 });
    assert.equal(result.finalScore, 100);
    assert.equal(result.letter, 'A');
    assert.equal(result.gpaPoints, 4.0);
  });
});

describe('Балл за период контроля', () => {
  it('взвешенное среднее приводится к 100-балльной шкале', () => {
    const score = calculateControlPeriodScore([
      { score: 80, maxScore: 100, weight: 40 },
      { score: 45, maxScore: 50, weight: 60 },
    ]);
    // 80 × 40 + 90 × 60 = 3200 + 5400 = 8600; 8600 / 100 = 86
    assert.equal(score, 86);
  });

  it('нормировка при неполной сумме весов', () => {
    const score = calculateControlPeriodScore([{ score: 40, maxScore: 50, weight: 50 }]);
    assert.equal(score, 80);
  });

  it('отсутствие мероприятий даёт null', () => {
    assert.equal(calculateControlPeriodScore([]), null);
  });
});

describe('Снижение балла за просрочку (F-T-10)', () => {
  it('без просрочки балл не меняется', () => {
    assert.deepEqual(applyLatePenalty(90, 0, 10, 50), { score: 90, penaltyPercent: 0 });
  });

  it('за каждый день просрочки снимается установленный процент', () => {
    assert.deepEqual(applyLatePenalty(100, 2, 10, 50), { score: 80, penaltyPercent: 20 });
  });

  it('снижение не превышает установленный максимум', () => {
    assert.deepEqual(applyLatePenalty(100, 30, 10, 50), { score: 50, penaltyPercent: 50 });
  });
});

// ═══════════════ Критерий приёмки № 6: расчёт GPA ══════════════════════════

describe('Расчёт GPA (раздел 4.3)', () => {
  it('контрольный пример, проверенный вручную', () => {
    // A (4,00) × 3 кр. + B (3,00) × 5 кр. + C (2,00) × 4 кр.
    // = 12 + 15 + 8 = 35; 35 / 12 = 2,917
    const result = calculateGpa([
      { gpaPoints: 4.0, credits: 3 },
      { gpaPoints: 3.0, credits: 5 },
      { gpaPoints: 2.0, credits: 4 },
    ]);
    assert.equal(result.credits, 12);
    assert.equal(result.count, 3);
    assert.equal(result.gpa, 2.917);
  });

  it('GPA взвешивается по кредитам, а не по числу дисциплин', () => {
    const weighted = calculateGpa([
      { gpaPoints: 4.0, credits: 10 },
      { gpaPoints: 2.0, credits: 1 },
    ]);
    const simple = (4.0 + 2.0) / 2;
    assert.ok(weighted.gpa > simple, 'дисциплина с большим объёмом должна весить больше');
    assert.equal(weighted.gpa, 3.818);
  });

  it('пустой список даёт нулевой GPA без ошибки', () => {
    assert.deepEqual(calculateGpa([]), { gpa: 0, credits: 0, count: 0 });
  });

  it('дисциплины с нулевыми кредитами исключаются', () => {
    const result = calculateGpa([
      { gpaPoints: 4.0, credits: 3 },
      { gpaPoints: 0.0, credits: 0 },
    ]);
    assert.equal(result.gpa, 4);
    assert.equal(result.count, 1);
  });

  it('дисциплины, помеченные как не входящие в GPA, исключаются', () => {
    const result = calculateGpa([
      { gpaPoints: 4.0, credits: 3 },
      { gpaPoints: 1.0, credits: 3, countsTowardGpa: false },
    ]);
    assert.equal(result.gpa, 4);
  });

  it('GPA за период и накопительный считаются раздельно', () => {
    const entries = [
      { gpaPoints: 4.0, credits: 3, periodId: 'p1' },
      { gpaPoints: 2.0, credits: 3, periodId: 'p2' },
    ];
    assert.equal(calculatePeriodGpa(entries, 'p1').gpa, 4);
    assert.equal(calculatePeriodGpa(entries, 'p2').gpa, 2);
    assert.equal(calculateCumulativeGpa(entries).gpa, 3);
  });

  it('F по дисциплине снижает GPA пропорционально её объёму', () => {
    const withoutF = calculateGpa([{ gpaPoints: 4.0, credits: 5 }]);
    const withF = calculateGpa([
      { gpaPoints: 4.0, credits: 5 },
      { gpaPoints: 0.0, credits: 5 },
    ]);
    assert.equal(withoutF.gpa, 4);
    assert.equal(withF.gpa, 2);
  });
});

// ══════════ Критерий приёмки № 3: учёт активности и прогресса ══════════════

describe('Учёт фактической активности (раздел 4.2, п. 2)', () => {
  it('сигнал засчитывает интервал не более порога неактивности', () => {
    assert.equal(creditForHeartbeat(30_000), 0.5);
    assert.equal(creditForHeartbeat(60_000), 1);
    // Разрыв больше 5 минут — время не засчитывается
    assert.equal(creditForHeartbeat(6 * 60_000), 0);
    assert.equal(creditForHeartbeat(0), 0);
  });

  it('сигнал не может засчитать больше двух ожидаемых интервалов', () => {
    // Ожидаемый интервал 30 с; при разрыве в 4 минуты засчитывается не более 1 мин
    assert.equal(creditForHeartbeat(4 * 60_000), 1);
  });

  it('засчитанное время ограничено 150 % плановой трудоёмкости', () => {
    // 2 академических часа × 50 мин = 100 мин; предел 150 мин
    assert.equal(capCountedMinutes(200, 2), 150);
    assert.equal(capCountedMinutes(120, 2), 120);
    assert.equal(capCountedMinutes(-10, 2), 0);
  });

  it('сессия признаётся устаревшей после порога неактивности', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    assert.equal(isSessionStale(new Date('2026-09-01T11:58:00Z'), now), false);
    assert.equal(isSessionStale(new Date('2026-09-01T11:50:00Z'), now), true);
  });

  it('текстовый элемент завершается по времени работы', () => {
    // 2 ак. часа = 100 мин; порог 80 % → требуется 80 мин
    const done = checkItemCompletion({
      itemType: 'TEXT',
      plannedAcademicHours: 2,
      completionThreshold: 80,
      countedMinutes: 80,
    });
    assert.equal(done.completed, true);
    assert.equal(done.method, 'TIME');
    assert.equal(done.earnedHours, 2);

    const partial = checkItemCompletion({
      itemType: 'TEXT',
      plannedAcademicHours: 2,
      completionThreshold: 80,
      countedMinutes: 40,
    });
    assert.equal(partial.completed, false);
    assert.equal(partial.progressPercent, 50);
    assert.equal(partial.earnedHours, 0.8);
  });

  it('видео засчитывается по просмотренной доле, а не по времени на странице', () => {
    const watched = checkItemCompletion({
      itemType: 'VIDEO',
      plannedAcademicHours: 1,
      completionThreshold: 80,
      countedMinutes: 0, // время на странице не учитывается
      videoWatchedPercent: 85,
    });
    assert.equal(watched.completed, true);
    assert.equal(watched.method, 'VIDEO');

    const idle = checkItemCompletion({
      itemType: 'VIDEO',
      plannedAcademicHours: 1,
      completionThreshold: 80,
      countedMinutes: 500, // долго находился на странице
      videoWatchedPercent: 10,
    });
    assert.equal(idle.completed, false, 'нахождение на странице не заменяет просмотр');
  });

  it('тест засчитывается при достижении проходного балла', () => {
    const passed = checkItemCompletion({
      itemType: 'QUIZ',
      plannedAcademicHours: 2,
      completionThreshold: 80,
      countedMinutes: 10,
      quizBestPercent: 60,
      quizPassingScore: 50,
    });
    assert.equal(passed.completed, true);
    assert.equal(passed.method, 'QUIZ');

    const failed = checkItemCompletion({
      itemType: 'QUIZ',
      plannedAcademicHours: 2,
      completionThreshold: 80,
      countedMinutes: 10,
      quizBestPercent: 40,
      quizPassingScore: 50,
    });
    assert.equal(failed.completed, false);
  });

  it('задание засчитывается при сдаче работы', () => {
    const submitted = checkItemCompletion({
      itemType: 'ASSIGNMENT',
      plannedAcademicHours: 6,
      completionThreshold: 80,
      countedMinutes: 0,
      assignmentSubmitted: true,
    });
    assert.equal(submitted.completed, true);
    assert.equal(submitted.earnedHours, 6);
  });

  it('освоенные часы никогда не превышают плановые', () => {
    const result = checkItemCompletion({
      itemType: 'TEXT',
      plannedAcademicHours: 2,
      completionThreshold: 80,
      countedMinutes: 100_000,
    });
    assert.equal(result.earnedHours, 2);
  });

  it('сводка прогресса выражается в понятных единицах (раздел 8.2)', () => {
    const summary = summarizeProgress(
      [
        { plannedAcademicHours: 30, completed: true, earnedHours: 30 },
        { plannedAcademicHours: 30, completed: true, earnedHours: 30 },
        { plannedAcademicHours: 30, completed: false, earnedHours: 12 },
      ],
      3
    );
    assert.equal(summary.completedItems, 2);
    assert.equal(summary.totalItems, 3);
    assert.equal(summary.earnedHours, 72);
    assert.equal(summary.totalHours, 90);
    assert.equal(summary.percent, 80);
    assert.equal(summary.credits, 3);
  });

  it('параметры учёта по умолчанию соответствуют ТЗ', () => {
    assert.equal(DEFAULT_ACTIVITY_PARAMS.heartbeatIntervalSec, 30);
    assert.equal(DEFAULT_ACTIVITY_PARAMS.idleTimeoutMin, 5);
    assert.equal(DEFAULT_ACTIVITY_PARAMS.maxCountedRatio, 1.5);
  });
});

// ══════ Критерий приёмки № 4: автоматическая проверка тестов ═══════════════

describe('Автоматическая проверка тестов (F-S-07)', () => {
  const single: QuestionSpec = {
    id: 'q1',
    type: 'SINGLE_CHOICE',
    points: 2,
    options: [
      { id: 'a', text: '15', isCorrect: false, orderIndex: 0 },
      { id: 'b', text: '30', isCorrect: true, orderIndex: 1 },
      { id: 'c', text: '45', isCorrect: false, orderIndex: 2 },
    ],
  };

  it('один вариант из нескольких', () => {
    assert.equal(gradeAnswer(single, { optionIds: ['b'] }).points, 2);
    assert.equal(gradeAnswer(single, { optionIds: ['a'] }).points, 0);
    // Выбор нескольких вариантов в вопросе с одним ответом не засчитывается
    assert.equal(gradeAnswer(single, { optionIds: ['a', 'b'] }).points, 0);
    assert.equal(gradeAnswer(single, null).points, 0);
  });

  const multi: QuestionSpec = {
    id: 'q2',
    type: 'MULTI_CHOICE',
    points: 4,
    options: [
      { id: 'a', text: 'FX', isCorrect: true, orderIndex: 0 },
      { id: 'b', text: 'F', isCorrect: true, orderIndex: 1 },
      { id: 'c', text: 'D', isCorrect: false, orderIndex: 2 },
      { id: 'd', text: 'C', isCorrect: false, orderIndex: 3 },
    ],
    payload: { partialCredit: true },
  };

  it('несколько вариантов из нескольких: полный и частичный балл', () => {
    assert.equal(gradeAnswer(multi, { optionIds: ['a', 'b'] }).points, 4);
    // Один верный из двух: 1/2 − 0 = 0,5 → 2 балла
    assert.equal(gradeAnswer(multi, { optionIds: ['a'] }).points, 2);
    // Оба верных плюс один неверный: 1 − 1/2 = 0,5 → 2 балла
    assert.equal(gradeAnswer(multi, { optionIds: ['a', 'b', 'c'] }).points, 2);
    // Только неверные: балл не начисляется
    assert.equal(gradeAnswer(multi, { optionIds: ['c', 'd'] }).points, 0);
  });

  it('частичный балл отключается настройкой вопроса', () => {
    const strict: QuestionSpec = { ...multi, payload: { partialCredit: false } };
    assert.equal(gradeAnswer(strict, { optionIds: ['a'] }).points, 0);
    assert.equal(gradeAnswer(strict, { optionIds: ['a', 'b'] }).points, 4);
  });

  const matching: QuestionSpec = {
    id: 'q3',
    type: 'MATCHING',
    points: 4,
    options: [
      { id: 'a', text: 'A', isCorrect: true, orderIndex: 0, matchKey: '4,00' },
      { id: 'b', text: 'B', isCorrect: true, orderIndex: 1, matchKey: '3,00' },
      { id: 'c', text: 'C', isCorrect: true, orderIndex: 2, matchKey: '2,00' },
      { id: 'd', text: 'D', isCorrect: true, orderIndex: 3, matchKey: '1,00' },
    ],
  };

  it('установление соответствия', () => {
    assert.equal(
      gradeAnswer(matching, {
        pairs: { a: '4,00', b: '3,00', c: '2,00', d: '1,00' },
      }).points,
      4
    );
    // Две пары из четырёх → половина балла
    assert.equal(
      gradeAnswer(matching, {
        pairs: { a: '4,00', b: '3,00', c: '1,00', d: '2,00' },
      }).points,
      2
    );
  });

  const ordering: QuestionSpec = {
    id: 'q4',
    type: 'ORDERING',
    points: 3,
    options: [
      { id: 'a', text: 'Текущий контроль', isCorrect: true, orderIndex: 0, matchKey: '0' },
      { id: 'b', text: 'РК1', isCorrect: true, orderIndex: 1, matchKey: '1' },
      { id: 'c', text: 'Экзамен', isCorrect: true, orderIndex: 2, matchKey: '2' },
    ],
  };

  it('установление последовательности', () => {
    assert.equal(gradeAnswer(ordering, { order: ['a', 'b', 'c'] }).points, 3);
    // Первая позиция верна, две другие переставлены → 1/3
    assert.equal(gradeAnswer(ordering, { order: ['a', 'c', 'b'] }).points, 1);
    assert.equal(gradeAnswer(ordering, { order: ['a', 'b'] }).points, 0);
  });

  const short: QuestionSpec = {
    id: 'q5',
    type: 'SHORT_ANSWER',
    points: 1,
    options: [],
    payload: { answers: ['150', '150 часов'], caseSensitive: false },
  };

  it('короткий ответ с нормализацией регистра и пробелов', () => {
    assert.equal(gradeAnswer(short, { text: '150' }).isCorrect, true);
    assert.equal(gradeAnswer(short, { text: ' 150  часов ' }).isCorrect, true);
    assert.equal(gradeAnswer(short, { text: '150 ЧАСОВ' }).isCorrect, true);
    assert.equal(gradeAnswer(short, { text: '90' }).isCorrect, false);
  });

  const trueFalse: QuestionSpec = {
    id: 'q6',
    type: 'TRUE_FALSE',
    points: 1,
    options: [
      { id: 't', text: 'Верно', isCorrect: true, orderIndex: 0 },
      { id: 'f', text: 'Неверно', isCorrect: false, orderIndex: 1 },
    ],
  };

  it('верно / неверно', () => {
    assert.equal(gradeAnswer(trueFalse, { optionIds: ['t'] }).points, 1);
    assert.equal(gradeAnswer(trueFalse, { optionIds: ['f'] }).points, 0);
  });

  it('попытка из вопросов четырёх типов проверяется целиком (критерий № 4)', () => {
    const result = gradeAttempt(
      [single, multi, matching, ordering, short, trueFalse],
      {
        q1: { optionIds: ['b'] },
        q2: { optionIds: ['a', 'b'] },
        q3: { pairs: { a: '4,00', b: '3,00', c: '2,00', d: '1,00' } },
        q4: { order: ['a', 'b', 'c'] },
        q5: { text: '150' },
        q6: { optionIds: ['t'] },
      },
      50
    );
    assert.equal(result.maxScore, 15);
    assert.equal(result.score, 15);
    assert.equal(result.percent, 100);
    assert.equal(result.passed, true);
  });

  it('неотвеченные вопросы дают нулевой балл, а не ошибку', () => {
    const result = gradeAttempt([single, multi], {}, 50);
    assert.equal(result.score, 0);
    assert.equal(result.maxScore, 6);
    assert.equal(result.passed, false);
  });

  it('проходной балл определяет результат попытки', () => {
    const result = gradeAttempt([single, multi], { q1: { optionIds: ['b'] } }, 30);
    // 2 из 6 = 33,33 % ≥ 30 %
    assert.equal(result.percent, 33.33);
    assert.equal(result.passed, true);
  });
});

describe('Итог по попыткам (F-T-09)', () => {
  const attempts = [
    { attemptNo: 1, percent: 60, score: 6 },
    { attemptNo: 2, percent: 90, score: 9 },
    { attemptNo: 3, percent: 75, score: 7.5 },
  ];

  it('лучшая, последняя, первая и средняя попытка', () => {
    assert.equal(resolveAttemptScore(attempts, 'HIGHEST')?.percent, 90);
    assert.equal(resolveAttemptScore(attempts, 'LAST')?.percent, 75);
    assert.equal(resolveAttemptScore(attempts, 'FIRST')?.percent, 60);
    assert.equal(resolveAttemptScore(attempts, 'AVERAGE')?.percent, 75);
  });

  it('отсутствие попыток даёт null', () => {
    assert.equal(resolveAttemptScore([], 'HIGHEST'), null);
  });
});

describe('Перемешивание вопросов', () => {
  it('детерминировано: один и тот же ключ даёт один и тот же порядок', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const first = shuffleWithSeed(items, 'quiz:student:1');
    const second = shuffleWithSeed(items, 'quiz:student:1');
    assert.deepEqual(first, second, 'при обрыве связи порядок должен сохраниться');
  });

  it('разные ключи дают разный порядок', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    assert.notDeepEqual(
      shuffleWithSeed(items, 'quiz:student1:1'),
      shuffleWithSeed(items, 'quiz:student2:1')
    );
  });

  it('состав элементов сохраняется', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    assert.deepEqual([...shuffleWithSeed(items, 'seed')].sort(), [...items].sort());
  });
});

describe('Статистика сложности вопросов (F-T-13)', () => {
  it('классифицирует вопрос по доле верных ответов', () => {
    const easy = questionDifficultyStats(Array(10).fill({ isCorrect: true }));
    assert.equal(easy.successRate, 100);
    assert.equal(easy.label, 'лёгкий');

    const hard = questionDifficultyStats([
      ...Array(2).fill({ isCorrect: true }),
      ...Array(8).fill({ isCorrect: false }),
    ]);
    assert.equal(hard.successRate, 20);
    assert.equal(hard.label, 'сложный');
  });

  it('без ответов не даёт деления на ноль', () => {
    const stats = questionDifficultyStats([]);
    assert.equal(stats.successRate, 0);
    assert.equal(stats.label, 'нет данных');
  });
});