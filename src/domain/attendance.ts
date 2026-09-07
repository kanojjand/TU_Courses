/**
 * Посещаемость — раздел 4.6 ТЗ, требование F-LRN-06.
 *
 * Модуль чистый: никаких обращений к БД. Сводки нужны в трёх местах —
 * в журнале преподавателя, в кабинете студента и в сводке по группе, —
 * и считаться они обязаны одинаково.
 *
 * Зачем это отдельно от учёта активности. Пункт 40 Типовых правил обязывает
 * вуз передавать в информационную систему уполномоченного органа сведения
 * о посещаемости. Активность в системе (просмотренные материалы, время
 * в курсе) посещаемостью не является: студент может отработать материал
 * дома и пропустить занятие. Поэтому источник — отметки преподавателя,
 * а активность остаётся отдельным показателем вовлечённости.
 */

export type AttendanceStateCode = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'ONLINE';

export const ATTENDANCE_LABELS: Record<AttendanceStateCode, string> = {
  PRESENT: 'присутствовал',
  ABSENT: 'отсутствовал',
  LATE: 'опоздал',
  EXCUSED: 'по уважительной причине',
  ONLINE: 'дистанционно',
};

/** Краткие обозначения для плотной таблицы журнала */
export const ATTENDANCE_SHORT: Record<AttendanceStateCode, string> = {
  PRESENT: '+',
  ABSENT: 'н',
  LATE: 'оп',
  EXCUSED: 'ув',
  ONLINE: 'д',
};

export type LessonKindCode = 'LECTURE' | 'PRACTICE' | 'LAB' | 'SRSP' | 'CONSULT' | 'EXAM';

export const LESSON_KIND_LABELS: Record<LessonKindCode, string> = {
  LECTURE: 'лекция',
  PRACTICE: 'практическое занятие',
  LAB: 'лабораторное занятие',
  SRSP: 'СРСП',
  CONSULT: 'консультация',
  EXAM: 'экзамен',
};

/**
 * Состояния, засчитываемые как присутствие.
 *
 * Опоздание считается присутствием: студент был на занятии. «Уважительная
 * причина» присутствием не считается, но и в неявку по неуважительной
 * причине не попадает — это третья категория, и вуз обычно смотрит
 * на неё отдельно при решении о недопуске.
 */
export const PRESENT_STATES: AttendanceStateCode[] = ['PRESENT', 'LATE', 'ONLINE'];

export interface AttendanceMarkSpec {
  studentId: string;
  sessionId: string;
  state: AttendanceStateCode;
}

export interface AttendanceSessionSpec {
  id: string;
  heldOn: string;
  lessonKind: LessonKindCode;
}

export interface StudentAttendance {
  studentId: string;
  /** Всего занятий, проведённых к этому моменту */
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  online: number;
  /** Занятия, по которым отметка не проставлена */
  unmarked: number;
  /** Доля присутствия, % — без учёта непроставленных отметок */
  percent: number;
}

const pct = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/**
 * Сводка посещаемости по каждому обучающемуся курса.
 *
 * Непроставленные отметки не считаются пропуском: журнал заполняется
 * задним числом, и до заполнения показывать студенту неявку неверно.
 * Поэтому процент считается от числа занятий с отметкой.
 */
export function summarizeAttendance(
  studentIds: string[],
  sessions: AttendanceSessionSpec[],
  marks: AttendanceMarkSpec[]
): StudentAttendance[] {
  const bySession = new Map<string, Map<string, AttendanceStateCode>>();
  for (const m of marks) {
    const perStudent = bySession.get(m.studentId) ?? new Map();
    perStudent.set(m.sessionId, m.state);
    bySession.set(m.studentId, perStudent);
  }

  return studentIds.map((studentId) => {
    const own = bySession.get(studentId) ?? new Map<string, AttendanceStateCode>();
    const row: StudentAttendance = {
      studentId,
      total: sessions.length,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      online: 0,
      unmarked: 0,
      percent: 0,
    };

    for (const s of sessions) {
      const state = own.get(s.id);
      if (!state) {
        row.unmarked++;
        continue;
      }
      if (state === 'PRESENT') row.present++;
      else if (state === 'ABSENT') row.absent++;
      else if (state === 'LATE') row.late++;
      else if (state === 'EXCUSED') row.excused++;
      else if (state === 'ONLINE') row.online++;
    }

    const marked = sessions.length - row.unmarked;
    const attended = row.present + row.late + row.online;
    row.percent = pct(attended, marked);
    return row;
  });
}

export interface AttendanceRisk {
  studentId: string;
  percent: number;
  absent: number;
  /** Посещаемость ниже порога, установленного вузом */
  belowThreshold: boolean;
}

/**
 * Обучающиеся с посещаемостью ниже порога.
 *
 * Порог — настройка вуза, а не константа: ГОСО и Типовые правила
 * фиксированного значения не задают, решение о недопуске принимает вуз.
 */
export function attendanceRisks(
  rows: StudentAttendance[],
  thresholdPercent: number
): AttendanceRisk[] {
  return rows
    .filter((r) => r.total - r.unmarked > 0)
    .map((r) => ({
      studentId: r.studentId,
      percent: r.percent,
      absent: r.absent,
      belowThreshold: r.percent < thresholdPercent,
    }))
    .filter((r) => r.belowThreshold);
}

/** Свод по курсу целиком — для карточки преподавателя и отчётов */
export function courseAttendanceTotals(rows: StudentAttendance[]) {
  const students = rows.length;
  const marked = rows.reduce((a, r) => a + (r.total - r.unmarked), 0);
  const attended = rows.reduce((a, r) => a + r.present + r.late + r.online, 0);
  return {
    students,
    sessions: rows[0]?.total ?? 0,
    /** Средняя посещаемость по курсу, % */
    averagePercent: pct(attended, marked),
    absences: rows.reduce((a, r) => a + r.absent, 0),
    excused: rows.reduce((a, r) => a + r.excused, 0),
    unmarked: rows.reduce((a, r) => a + r.unmarked, 0),
  };
}

/**
 * Строки для передачи в информационную систему уполномоченного органа
 * (п. 40 Типовых правил) за указанную неделю.
 *
 * Передаётся факт посещения занятий, а не активность в системе: именно
 * этого требует норма. Занятия без отметок в выгрузку не попадают —
 * незаполненный журнал не должен выглядеть как поголовная неявка.
 */
export function weeklyAttendanceRows(
  sessions: AttendanceSessionSpec[],
  marks: AttendanceMarkSpec[],
  weekStart: Date,
  weekEnd: Date
): { studentId: string; heldSessions: number; attendedSessions: number; attended: boolean }[] {
  const from = weekStart.toISOString().slice(0, 10);
  const to = weekEnd.toISOString().slice(0, 10);
  const inWeek = sessions.filter((s) => s.heldOn >= from && s.heldOn <= to);
  const ids = new Set(inWeek.map((s) => s.id));
  if (ids.size === 0) return [];

  const byStudent = new Map<string, { held: number; attended: number }>();
  for (const m of marks) {
    if (!ids.has(m.sessionId)) continue;
    const acc = byStudent.get(m.studentId) ?? { held: 0, attended: 0 };
    acc.held++;
    if (PRESENT_STATES.includes(m.state)) acc.attended++;
    byStudent.set(m.studentId, acc);
  }

  return [...byStudent].map(([studentId, acc]) => ({
    studentId,
    heldSessions: acc.held,
    attendedSessions: acc.attended,
    attended: acc.attended > 0,
  }));
}
