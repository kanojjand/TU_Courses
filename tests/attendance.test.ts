import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeAttendance,
  attendanceRisks,
  courseAttendanceTotals,
  weeklyAttendanceRows,
  PRESENT_STATES,
  type AttendanceMarkSpec,
  type AttendanceSessionSpec,
} from '../src/domain/attendance';

/**
 * Посещаемость — F-LRN-06.
 * Сведения о посещаемости передаются в ИС уполномоченного органа
 * (п. 40 Типовых правил), поэтому считаться они должны однозначно.
 */

const sessions: AttendanceSessionSpec[] = [
  { id: 's1', heldOn: '2026-09-07', lessonKind: 'LECTURE' },
  { id: 's2', heldOn: '2026-09-09', lessonKind: 'PRACTICE' },
  { id: 's3', heldOn: '2026-09-14', lessonKind: 'LECTURE' },
  { id: 's4', heldOn: '2026-09-16', lessonKind: 'PRACTICE' },
];

const mark = (
  studentId: string,
  sessionId: string,
  state: AttendanceMarkSpec['state']
): AttendanceMarkSpec => ({ studentId, sessionId, state });

describe('Сводка посещаемости', () => {
  it('считает присутствие, пропуски и процент', () => {
    const rows = summarizeAttendance(
      ['a'],
      sessions,
      [
        mark('a', 's1', 'PRESENT'),
        mark('a', 's2', 'ABSENT'),
        mark('a', 's3', 'LATE'),
        mark('a', 's4', 'PRESENT'),
      ]
    );
    const a = rows[0];
    assert.equal(a.total, 4);
    assert.equal(a.present, 2);
    assert.equal(a.late, 1);
    assert.equal(a.absent, 1);
    assert.equal(a.unmarked, 0);
    // Опоздание засчитывается как присутствие: студент был на занятии
    assert.equal(a.percent, 75);
  });

  it('опоздание и дистанционное участие считаются присутствием', () => {
    assert.deepEqual(PRESENT_STATES.sort(), ['LATE', 'ONLINE', 'PRESENT']);
    const rows = summarizeAttendance(
      ['a'],
      sessions,
      [
        mark('a', 's1', 'LATE'),
        mark('a', 's2', 'ONLINE'),
        mark('a', 's3', 'PRESENT'),
        mark('a', 's4', 'PRESENT'),
      ]
    );
    assert.equal(rows[0].percent, 100);
  });

  it('уважительная причина присутствием не считается', () => {
    const rows = summarizeAttendance(
      ['a'],
      sessions,
      [
        mark('a', 's1', 'PRESENT'),
        mark('a', 's2', 'EXCUSED'),
        mark('a', 's3', 'PRESENT'),
        mark('a', 's4', 'PRESENT'),
      ]
    );
    assert.equal(rows[0].excused, 1);
    assert.equal(rows[0].percent, 75);
  });

  it('непроставленная отметка не считается пропуском', () => {
    // Журнал заполняется задним числом: до заполнения показывать неявку неверно
    const rows = summarizeAttendance(['a'], sessions, [
      mark('a', 's1', 'PRESENT'),
      mark('a', 's2', 'PRESENT'),
    ]);
    assert.equal(rows[0].unmarked, 2);
    assert.equal(rows[0].absent, 0);
    assert.equal(rows[0].percent, 100);
  });

  it('обучающийся без единой отметки не даёт ложных нулей', () => {
    const rows = summarizeAttendance(['a'], sessions, []);
    assert.equal(rows[0].unmarked, 4);
    assert.equal(rows[0].percent, 0);
    // В группу риска он не попадает: данных ещё нет
    assert.deepEqual(attendanceRisks(rows, 50), []);
  });

  it('считает каждого обучающегося отдельно', () => {
    const rows = summarizeAttendance(
      ['a', 'b'],
      sessions,
      [
        mark('a', 's1', 'PRESENT'),
        mark('a', 's2', 'PRESENT'),
        mark('a', 's3', 'PRESENT'),
        mark('a', 's4', 'PRESENT'),
        mark('b', 's1', 'ABSENT'),
        mark('b', 's2', 'ABSENT'),
        mark('b', 's3', 'ABSENT'),
        mark('b', 's4', 'PRESENT'),
      ]
    );
    assert.equal(rows.find((r) => r.studentId === 'a')!.percent, 100);
    assert.equal(rows.find((r) => r.studentId === 'b')!.percent, 25);
  });
});

describe('Группа риска по посещаемости', () => {
  const rows = summarizeAttendance(
    ['a', 'b', 'c'],
    sessions,
    [
      ...sessions.map((s) => mark('a', s.id, 'PRESENT')),
      mark('b', 's1', 'ABSENT'),
      mark('b', 's2', 'ABSENT'),
      mark('b', 's3', 'ABSENT'),
      mark('b', 's4', 'PRESENT'),
      mark('c', 's1', 'PRESENT'),
      mark('c', 's2', 'ABSENT'),
      mark('c', 's3', 'PRESENT'),
      mark('c', 's4', 'PRESENT'),
    ]
  );

  it('порог задаётся вузом, а не константой в коде', () => {
    assert.equal(attendanceRisks(rows, 50).length, 1);
    assert.equal(attendanceRisks(rows, 80).length, 2);
    assert.equal(attendanceRisks(rows, 0).length, 0);
  });

  it('в риск попадает тот, у кого посещаемость ниже порога', () => {
    const risky = attendanceRisks(rows, 50);
    assert.equal(risky[0].studentId, 'b');
    assert.equal(risky[0].percent, 25);
    assert.equal(risky[0].absent, 3);
  });
});

describe('Свод по курсу', () => {
  it('даёт среднюю посещаемость и число пропусков', () => {
    const rows = summarizeAttendance(
      ['a', 'b'],
      sessions,
      [
        ...sessions.map((s) => mark('a', s.id, 'PRESENT')),
        mark('b', 's1', 'PRESENT'),
        mark('b', 's2', 'ABSENT'),
        mark('b', 's3', 'EXCUSED'),
        mark('b', 's4', 'PRESENT'),
      ]
    );
    const t = courseAttendanceTotals(rows);
    assert.equal(t.students, 2);
    assert.equal(t.sessions, 4);
    // 6 присутствий из 8 отметок
    assert.equal(t.averagePercent, 75);
    assert.equal(t.absences, 1);
    assert.equal(t.excused, 1);
    assert.equal(t.unmarked, 0);
  });
});

describe('Выгрузка посещаемости за неделю (п. 40 Типовых правил)', () => {
  const marks = [
    mark('a', 's1', 'PRESENT'),
    mark('a', 's2', 'ABSENT'),
    mark('b', 's1', 'ABSENT'),
    mark('b', 's2', 'ABSENT'),
    mark('a', 's3', 'PRESENT'),
  ];

  it('берёт только занятия внутри недели', () => {
    const rows = weeklyAttendanceRows(
      sessions,
      marks,
      new Date('2026-09-07'),
      new Date('2026-09-13')
    );
    const a = rows.find((r) => r.studentId === 'a')!;
    assert.equal(a.heldSessions, 2, 'занятие 14 сентября в неделю не входит');
    assert.equal(a.attendedSessions, 1);
    assert.equal(a.attended, true);
  });

  it('полная неявка отражается как отсутствие участия', () => {
    const rows = weeklyAttendanceRows(
      sessions,
      marks,
      new Date('2026-09-07'),
      new Date('2026-09-13')
    );
    const b = rows.find((r) => r.studentId === 'b')!;
    assert.equal(b.attendedSessions, 0);
    assert.equal(b.attended, false);
  });

  it('неделя без занятий не даёт строк выгрузки', () => {
    const rows = weeklyAttendanceRows(
      sessions,
      marks,
      new Date('2026-10-05'),
      new Date('2026-10-11')
    );
    assert.deepEqual(rows, []);
  });

  it('незаполненный журнал не выглядит как поголовная неявка', () => {
    // Занятия есть, отметок нет — строк выгрузки быть не должно
    const rows = weeklyAttendanceRows(
      sessions,
      [],
      new Date('2026-09-07'),
      new Date('2026-09-13')
    );
    assert.deepEqual(rows, []);
  });
});
