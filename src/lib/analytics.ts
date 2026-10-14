import 'server-only';
import { and, avg, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicPeriods,
  calendarWindows,
  courseVersions,
  departments,
  disciplines,
  enrollments,
  exportBatches,
  gradeItems,
  grades,
  lessonProgress,
  offerings,
  students,
  studyGroups,
  users,
  programs,
} from '@/db/schema';
import { flattenLessons, type CourseSnapshot } from './course';
import type { Scope } from './rbac';
import { chunk } from './utils';

/** Пороги «отстающего» для дашбордов деканата и эдвайзера */
export const LAGGING_PROGRESS = 40;
export const LAGGING_GRADE = 50;

export async function currentPeriodIds() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select({ id: academicPeriods.id }).from(academicPeriods).where(gte(academicPeriods.endsOn, today));
  return rows.map((r) => r.id);
}

export type OfferingStat = {
  offering: typeof offerings.$inferSelect;
  discipline: typeof disciplines.$inferSelect;
  teacher: { lastName: string; firstName: string; middleName: string | null } | null;
  students: number;
  lessons: number;
  avgProgress: number | null;
  avgGrade: number | null;
  confirmedSheets: number;
};

/** Сводка по потокам: студенты, прогресс по курсу, средний балл, подтверждённые ведомости */
export async function offeringStats(scope: Scope, periodIds?: string[]): Promise<OfferingStat[]> {
  const pids = periodIds ?? (await currentPeriodIds());
  if (!pids.length) return [];
  if (!scope.all && !scope.ids.length) return [];
  const rows = await db
    .select({ offering: offerings, discipline: disciplines, teacher: { lastName: users.lastName, firstName: users.firstName, middleName: users.middleName } })
    .from(offerings)
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .leftJoin(users, eq(users.id, offerings.teacherId))
    .where(and(inArray(offerings.periodId, pids), scope.all ? undefined : inArray(disciplines.departmentId, scope.ids)));
  const ids = rows.map((r) => r.offering.id);
  if (!ids.length) return [];
  const [stud, avgG, sheets] = await Promise.all([
    db.select({ o: enrollments.offeringId, n: count() }).from(enrollments).where(and(inArray(enrollments.offeringId, ids), eq(enrollments.status, 'active'))).groupBy(enrollments.offeringId),
    db.select({ o: gradeItems.offeringId, a: avg(grades.score) }).from(grades).innerJoin(gradeItems, eq(gradeItems.id, grades.gradeItemId)).where(inArray(gradeItems.offeringId, ids)).groupBy(gradeItems.offeringId),
    db.select({ o: exportBatches.offeringId, n: count() }).from(exportBatches).where(and(inArray(exportBatches.offeringId, ids), eq(exportBatches.status, 'confirmed'))).groupBy(exportBatches.offeringId),
  ]);
  // Прогресс: по каждой версии курса — сколько уроков прошли записанные студенты
  const byVersion = new Map<string, string[]>();
  rows.forEach((r) => r.offering.courseVersionId && byVersion.set(r.offering.courseVersionId, [...(byVersion.get(r.offering.courseVersionId) ?? []), r.offering.id]));
  const versions = byVersion.size ? await db.select().from(courseVersions).where(inArray(courseVersions.id, [...byVersion.keys()])) : [];
  const lessonsOf = new Map(versions.map((v) => [v.id, flattenLessons(v.snapshot as CourseSnapshot).map((l) => l.id)]));
  const completed = new Map<string, number>();
  for (const [vid, offs] of byVersion) {
    const lessonIds = lessonsOf.get(vid) ?? [];
    if (!lessonIds.length) continue;
    const res = await db
      .select({ o: enrollments.offeringId, n: sql<number>`count(distinct (${lessonProgress.studentId}, ${lessonProgress.lessonId}))::int` })
      .from(enrollments)
      .innerJoin(lessonProgress, and(eq(lessonProgress.studentId, enrollments.studentId), eq(lessonProgress.status, 'completed'), inArray(lessonProgress.lessonId, lessonIds)))
      .where(and(inArray(enrollments.offeringId, offs), eq(enrollments.status, 'active')))
      .groupBy(enrollments.offeringId);
    res.forEach((r) => completed.set(r.o, r.n));
  }
  return rows.map((r) => {
    const n = stud.find((x) => x.o === r.offering.id)?.n ?? 0;
    const lessons = r.offering.courseVersionId ? (lessonsOf.get(r.offering.courseVersionId)?.length ?? 0) : 0;
    const g = avgG.find((x) => x.o === r.offering.id)?.a;
    return {
      ...r,
      teacher: r.teacher?.lastName ? r.teacher : null,
      students: n,
      lessons,
      avgProgress: lessons && n ? Math.round(((completed.get(r.offering.id) ?? 0) / (lessons * n)) * 100) : r.offering.courseVersionId ? 0 : null,
      avgGrade: g !== null && g !== undefined ? Math.round(Number(g) * 10) / 10 : null,
      confirmedSheets: sheets.find((x) => x.o === r.offering.id)?.n ?? 0,
    };
  });
}

export type StudentStat = {
  user: { id: string; lastName: string; firstName: string; middleName: string | null; login: string };
  groupId: string | null;
  groupCode: string;
  courses: number;
  avgProgress: number | null;
  avgGrade: number | null;
  lastSeen: Date | null;
  lagging: boolean;
};

/** Студенты групп: средний прогресс по всем курсам и средний балл — для деканата и эдвайзера */
export async function studentStats(filter: { groupIds?: string[] | 'all'; facultyIds?: string[] }): Promise<StudentStat[]> {
  let groupIds: string[] | null = filter.groupIds === 'all' || filter.groupIds === undefined ? null : filter.groupIds;
  const facultyIds = filter.facultyIds;
  if (facultyIds) {
    const gs = await db
      .select({ id: studyGroups.id })
      .from(studyGroups)
      .innerJoin(programs, eq(programs.id, studyGroups.programId))
      .innerJoin(departments, eq(departments.id, programs.departmentId))
      .where(inArray(departments.facultyId, facultyIds));
    groupIds = gs.map((g) => g.id);
  }
  if (groupIds && !groupIds.length) return [];
  const studs = await db
    .select({ user: { id: users.id, lastName: users.lastName, firstName: users.firstName, middleName: users.middleName, login: users.login }, groupId: students.groupId, groupCode: studyGroups.code })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(studyGroups, eq(studyGroups.id, students.groupId))
    .where(and(eq(students.status, 'studying'), groupIds ? inArray(students.groupId, groupIds) : undefined));
  const ids = studs.map((s) => s.user.id);
  if (!ids.length) return [];
  const pids = await currentPeriodIds();
  // Курсы студента: версии курсов его потоков
  const enr: { s: string; v: string | null }[] = [];
  const gradeAvg = new Map<string, number>();
  const progress = new Map<string, { done: number; seen: Date | null }>();
  for (const part of chunk(ids, 2000)) {
    enr.push(
      ...(await db
        .select({ s: enrollments.studentId, v: offerings.courseVersionId })
        .from(enrollments)
        .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
        .where(and(inArray(enrollments.studentId, part), eq(enrollments.status, 'active'), pids.length ? inArray(offerings.periodId, pids) : undefined))),
    );
    (await db.select({ s: grades.studentId, a: avg(grades.score) }).from(grades).where(inArray(grades.studentId, part)).groupBy(grades.studentId)).forEach((r) =>
      gradeAvg.set(r.s, Math.round(Number(r.a) * 10) / 10),
    );
    (
      await db
        .select({ s: lessonProgress.studentId, n: sql<number>`count(distinct ${lessonProgress.lessonId}) filter (where ${lessonProgress.status} = 'completed')::int`, seen: sql<Date | null>`max(${lessonProgress.lastSeenAt})` })
        .from(lessonProgress)
        .where(inArray(lessonProgress.studentId, part))
        .groupBy(lessonProgress.studentId)
    ).forEach((r) => progress.set(r.s, { done: r.n, seen: r.seen ? new Date(r.seen) : null }));
  }
  const versionIds = [...new Set(enr.map((e) => e.v).filter(Boolean))] as string[];
  const versions = versionIds.length ? await db.select().from(courseVersions).where(inArray(courseVersions.id, versionIds)) : [];
  const lessonsOf = new Map(versions.map((v) => [v.id, flattenLessons(v.snapshot as CourseSnapshot).length]));
  return studs.map((s) => {
    const vs = [...new Set(enr.filter((e) => e.s === s.user.id && e.v).map((e) => e.v!))];
    const total = vs.reduce((sum, v) => sum + (lessonsOf.get(v) ?? 0), 0);
    const p = progress.get(s.user.id);
    const avgProgress = total ? Math.min(100, Math.round(((p?.done ?? 0) / total) * 100)) : null;
    const avgGrade = gradeAvg.get(s.user.id) ?? null;
    return {
      ...s,
      groupCode: s.groupCode ?? '',
      courses: vs.length,
      avgProgress,
      avgGrade,
      lastSeen: p?.seen ?? null,
      lagging: (avgProgress !== null && avgProgress < LAGGING_PROGRESS) || (avgGrade !== null && avgGrade < LAGGING_GRADE),
    };
  });
}

/** Незакрытые ведомости: окно выставления оценок прошло, а Platonus не подтвердил */
export async function unclosedSheets(stats: OfferingStat[]) {
  const ids = stats.map((s) => s.offering.id);
  if (!ids.length) return [];
  const items = await db.select({ o: gradeItems.offeringId, c: gradeItems.component }).from(gradeItems).where(inArray(gradeItems.offeringId, ids));
  const batches = await db.select().from(exportBatches).where(inArray(exportBatches.offeringId, ids));
  const pids = [...new Set(stats.map((s) => s.offering.periodId))];
  const wins = await db.select().from(calendarWindows).where(inArray(calendarWindows.periodId, pids));
  const now = Date.now();
  const kindOf = { TK1: 'grading_rk1', RK1: 'grading_rk1', TK2: 'grading_rk2', RK2: 'grading_rk2', EXAM: 'grading_exam' } as const;
  const out: { stat: OfferingStat; component: string; status: string | null; windowEnd: Date }[] = [];
  for (const s of stats) {
    const comps = [...new Set(items.filter((i) => i.o === s.offering.id).map((i) => i.c))];
    for (const c of comps) {
      const w = wins.find((x) => x.periodId === s.offering.periodId && x.kind === kindOf[c]);
      if (!w || w.endsAt.getTime() > now) continue;
      const b = batches.filter((x) => x.offeringId === s.offering.id && x.component === c && x.comment !== 'correction');
      if (!b.some((x) => x.status === 'confirmed')) out.push({ stat: s, component: c, status: b[0]?.status ?? null, windowEnd: w.endsAt });
    }
  }
  return out;
}

export function avgOf(list: (number | null)[]) {
  const v = list.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
