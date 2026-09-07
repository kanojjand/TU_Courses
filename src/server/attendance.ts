import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  summarizeAttendance,
  attendanceRisks,
  courseAttendanceTotals,
  weeklyAttendanceRows,
  type AttendanceSessionSpec,
  type AttendanceMarkSpec,
} from '@/domain/attendance';
import { getSetting } from '@/server/settings';
import { SETTINGS } from '@/domain/constants';

/**
 * Посещаемость — чтение. Раздел 4.6 ТЗ, требование F-LRN-06.
 */

/** Порог посещаемости для попадания в группу риска — настройка вуза */
export async function attendanceThreshold(): Promise<number> {
  const raw = await getSetting(SETTINGS.ATTENDANCE_THRESHOLD);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 50;
}

/** Журнал посещаемости курса: занятия, отметки и сводка по каждому студенту */
export async function loadAttendance(courseId: string) {
  const [sessions, enrollments, threshold] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { courseId },
      include: {
        marks: {
          select: { id: true, studentId: true, state: true, reason: true },
        },
        module: { select: { id: true, title: true } },
      },
      orderBy: [{ heldOn: 'asc' }, { startsAt: 'asc' }],
    }),
    prisma.enrollment.findMany({
      where: { courseId, cancelledAt: null, status: { in: ['REGISTERED', 'COMPLETED', 'RETAKE'] } },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } },
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { student: { user: { lastNameRu: 'asc' } } },
    }),
    attendanceThreshold(),
  ]);

  const sessionSpecs: AttendanceSessionSpec[] = sessions.map((s) => ({
    id: s.id,
    heldOn: s.heldOn.toISOString().slice(0, 10),
    lessonKind: s.lessonKind,
  }));
  const markSpecs: AttendanceMarkSpec[] = sessions.flatMap((s) =>
    s.marks.map((m) => ({ studentId: m.studentId, sessionId: s.id, state: m.state }))
  );

  const studentIds = enrollments.map((e) => e.studentId);
  const summary = summarizeAttendance(studentIds, sessionSpecs, markSpecs);

  return {
    sessions,
    students: enrollments.map((e) => e.student),
    summary,
    risks: attendanceRisks(summary, threshold),
    totals: courseAttendanceTotals(summary),
    threshold,
  };
}

/** Посещаемость одного обучающегося по всем его курсам периода */
export async function studentAttendance(studentId: string, periodId?: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      cancelledAt: null,
      course: periodId ? { periodId } : undefined,
    },
    select: {
      courseId: true,
      course: {
        select: {
          id: true,
          slug: true,
          discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
          period: { select: { name: true } },
        },
      },
    },
  });
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((e) => e.courseId);
  const sessions = await prisma.attendanceSession.findMany({
    where: { courseId: { in: courseIds } },
    select: {
      id: true,
      courseId: true,
      heldOn: true,
      lessonKind: true,
      marks: { where: { studentId }, select: { state: true, reason: true } },
    },
    orderBy: { heldOn: 'asc' },
  });

  return enrollments.map((e) => {
    const own = sessions.filter((s) => s.courseId === e.courseId);
    const [row] = summarizeAttendance(
      [studentId],
      own.map((s) => ({
        id: s.id,
        heldOn: s.heldOn.toISOString().slice(0, 10),
        lessonKind: s.lessonKind,
      })),
      own.flatMap((s) =>
        s.marks.map((m) => ({ studentId, sessionId: s.id, state: m.state }))
      )
    );
    return { course: e.course, summary: row, sessions: own };
  });
}

/**
 * Сводка посещаемости по академической группе (F-GRP-03).
 * Считается по всем курсам, на которые зарегистрированы её обучающиеся.
 */
export async function groupAttendance(groupId: string, periodId?: string) {
  const students = await prisma.studentProfile.findMany({
    where: { groupId, status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY'] } },
    select: { id: true },
  });
  if (students.length === 0) return { rows: [], averagePercent: 0 };

  const studentIds = students.map((s) => s.id);
  const marks = await prisma.attendanceMark.findMany({
    where: {
      studentId: { in: studentIds },
      session: periodId ? { course: { periodId } } : undefined,
    },
    select: { studentId: true, sessionId: true, state: true },
  });

  const sessionIds = [...new Set(marks.map((m) => m.sessionId))];
  const sessions = await prisma.attendanceSession.findMany({
    where: { id: { in: sessionIds } },
    select: { id: true, heldOn: true, lessonKind: true },
  });

  // Сводка по группе считается по занятиям, на которых её студенты
  // действительно отмечались: у разных студентов набор курсов различается,
  // и общий знаменатель дал бы заниженный процент
  const rows = studentIds.map((studentId) => {
    const own = marks.filter((m) => m.studentId === studentId);
    const ownSessions = sessions.filter((s) => own.some((m) => m.sessionId === s.id));
    const [row] = summarizeAttendance(
      [studentId],
      ownSessions.map((s) => ({
        id: s.id,
        heldOn: s.heldOn.toISOString().slice(0, 10),
        lessonKind: s.lessonKind,
      })),
      own
    );
    return row;
  });

  // Процент считается так же, как в журнале курса: посещённые занятия
  // ко всем занятиям с отметкой. Усреднение процентов по студентам дало бы
  // близкое, но другое число, и две сводки рядом расходились бы на десятые
  const attended = rows.reduce((a, r) => a + r.present + r.late + r.online, 0);
  const marked = rows.reduce((a, r) => a + (r.total - r.unmarked), 0);
  return {
    rows,
    averagePercent: marked === 0 ? 0 : Math.round((attended / marked) * 1000) / 10,
  };
}

/**
 * Строки посещаемости курса за неделю — для передачи в ИС уполномоченного
 * органа (п. 40 Типовых правил).
 */
export async function weeklyAttendance(courseId: string, weekStart: Date, weekEnd: Date) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { courseId, heldOn: { gte: weekStart, lte: weekEnd } },
    select: {
      id: true,
      heldOn: true,
      lessonKind: true,
      marks: { select: { studentId: true, state: true } },
    },
  });

  return weeklyAttendanceRows(
    sessions.map((s) => ({
      id: s.id,
      heldOn: s.heldOn.toISOString().slice(0, 10),
      lessonKind: s.lessonKind,
    })),
    sessions.flatMap((s) =>
      s.marks.map((m) => ({ studentId: m.studentId, sessionId: s.id, state: m.state }))
    ),
    weekStart,
    weekEnd
  );
}
