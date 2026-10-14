import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicPeriods,
  assignments,
  courseVersions,
  disciplines,
  enrollments,
  lessonBlocks,
  lessonProgress,
  offerings,
  submissions,
  users,
  videoProgress,
} from '@/db/schema';
import type { SessionUser } from './auth';
import { flattenLessons, type CourseSnapshot } from './course';
import { completedCounts, schemeForOffering } from './progress';
import { departmentScope, inScope, userHasRole } from './rbac';
import { rkAdmission } from './rules/admission';
import { chunk } from './utils';

export async function teacherOfferings(teacherId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ offering: offerings, discipline: disciplines, period: academicPeriods })
    .from(offerings)
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(academicPeriods, eq(academicPeriods.id, offerings.periodId))
    .where(and(eq(offerings.teacherId, teacherId), gte(academicPeriods.endsOn, today)))
    .orderBy(asc(disciplines.nameRu), asc(offerings.stream));
  const ids = rows.map((r) => r.offering.id);
  if (!ids.length) return [];
  const [studentsN, reviewN] = await Promise.all([
    db
      .select({ o: enrollments.offeringId, n: count() })
      .from(enrollments)
      .where(and(inArray(enrollments.offeringId, ids), eq(enrollments.status, 'active')))
      .groupBy(enrollments.offeringId),
    db
      .select({ o: submissions.offeringId, n: count() })
      .from(submissions)
      .where(and(inArray(submissions.offeringId, ids), isNull(submissions.score)))
      .groupBy(submissions.offeringId),
  ]);
  const versionIds = rows.map((r) => r.offering.courseVersionId).filter(Boolean) as string[];
  const versions = versionIds.length ? await db.select().from(courseVersions).where(inArray(courseVersions.id, versionIds)) : [];
  const snapBy = new Map(versions.map((v) => [v.id, v.snapshot as CourseSnapshot]));
  return Promise.all(
    rows.map(async (r) => {
      const snap = r.offering.courseVersionId ? snapBy.get(r.offering.courseVersionId) : undefined;
      let avg: number | null = null;
      if (snap) {
        const lessonIds = flattenLessons(snap).map((l) => l.id);
        const sids = await enrolledStudentIds(r.offering.id);
        const done = await completedCounts(sids, lessonIds);
        avg = sids.length && lessonIds.length ? Math.round((sids.reduce((s, id) => s + (done.get(id) ?? 0), 0) / (sids.length * lessonIds.length)) * 100) : 0;
      }
      return {
        ...r,
        students: studentsN.find((x) => x.o === r.offering.id)?.n ?? 0,
        toReview: reviewN.find((x) => x.o === r.offering.id)?.n ?? 0,
        courseTitle: snap?.title ?? null,
        avgProgress: avg,
      };
    }),
  );
}

export async function enrolledStudentIds(offeringId: string) {
  const rows = await db
    .select({ id: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.offeringId, offeringId), eq(enrollments.status, 'active')));
  return rows.map((r) => r.id);
}

/** Кто может открыть журнал потока: преподаватель — править, кафедра и офисы — смотреть */
export async function offeringAccess(user: SessionUser, offeringId: string) {
  const [row] = await db
    .select({ offering: offerings, discipline: disciplines, period: academicPeriods })
    .from(offerings)
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(academicPeriods, eq(academicPeriods.id, offerings.periodId))
    .where(eq(offerings.id, offeringId));
  if (!row) return null;
  const isTeacher = row.offering.teacherId === user.id;
  let canView = isTeacher || ['registrar', 'academic_office', 'rector', 'admin'].some((r) => userHasRole(user, r as 'admin'));
  if (!canView && userHasRole(user, 'dept_head')) canView = inScope(await departmentScope(user, 'dept_head'), row.discipline.departmentId);
  if (!canView && userHasRole(user, 'dean')) canView = inScope(await departmentScope(user, 'dean'), row.discipline.departmentId);
  if (!canView) return null;
  return { ...row, canEdit: isTeacher };
}

/** Прогресс студентов потока: уроки, видео, последняя активность, допуски к РК */
export async function offeringProgress(offeringId: string, studentIds: string[]) {
  const [off] = await db.select().from(offerings).where(eq(offerings.id, offeringId));
  const empty = new Map<string, { lessonsPct: number; videosPct: number; lastSeen: Date | null; rk1: boolean | null; rk2: boolean | null }>();
  if (!off?.courseVersionId || !studentIds.length) return empty;
  const [v] = await db.select().from(courseVersions).where(eq(courseVersions.id, off.courseVersionId));
  const snap = v.snapshot as CourseSnapshot;
  const scheme = await schemeForOffering(offeringId);
  const ls = flattenLessons(snap);
  const lessonIds = ls.map((l) => l.id);
  const videos = ls.flatMap((l) => l.blocks.filter((b) => b.type === 'video').map((b) => ({ blockId: b.id, lessonId: l.id, week: l.week, required: b.required })));
  const videoIds = videos.map((x) => x.blockId);
  const lp: { s: string; l: string; st: string; seen: Date }[] = [];
  const vp: { s: string; b: string; p: number }[] = [];
  for (const part of chunk(studentIds, 1000)) {
    if (lessonIds.length)
      lp.push(
        ...(await db
          .select({ s: lessonProgress.studentId, l: lessonProgress.lessonId, st: lessonProgress.status, seen: lessonProgress.lastSeenAt })
          .from(lessonProgress)
          .where(and(inArray(lessonProgress.studentId, part), inArray(lessonProgress.lessonId, lessonIds)))),
      );
    if (videoIds.length)
      vp.push(
        ...(await db
          .select({ s: videoProgress.studentId, b: videoProgress.blockId, p: videoProgress.percent })
          .from(videoProgress)
          .where(and(inArray(videoProgress.studentId, part), inArray(videoProgress.blockId, videoIds)))),
      );
  }
  const out = empty;
  for (const sid of studentIds) {
    const mine = lp.filter((x) => x.s === sid);
    const completed = new Set(mine.filter((x) => x.st === 'completed').map((x) => x.l));
    const vmap = new Map(vp.filter((x) => x.s === sid).map((x) => [x.b, x.p]));
    const watched = videos.filter((x) => (vmap.get(x.blockId) ?? 0) >= scheme.videoThreshold).length;
    const lastSeen = mine.reduce<Date | null>((m, x) => (!m || x.seen > m ? x.seen : m), null);
    const base = { lessons: ls.map((l) => ({ id: l.id, week: l.week, required: l.required })), completedLessonIds: completed, videos, videoPercent: vmap, videoThreshold: scheme.videoThreshold };
    out.set(sid, {
      lessonsPct: lessonIds.length ? Math.round((completed.size / lessonIds.length) * 100) : 0,
      videosPct: videos.length ? Math.round((watched / videos.length) * 100) : 0,
      lastSeen,
      rk1: rkAdmission({ ...base, rkWeek: scheme.rk1Week }).admitted,
      rk2: rkAdmission({ ...base, rkWeek: scheme.rk2Week }).admitted,
    });
  }
  return out;
}

/** Тесты и задания курса потока — для привязки к элементам оценивания */
export async function offeringAssessableBlocks(offeringId: string) {
  const [off] = await db.select().from(offerings).where(eq(offerings.id, offeringId));
  if (!off?.courseVersionId) return [];
  const [v] = await db.select().from(courseVersions).where(eq(courseVersions.id, off.courseVersionId));
  const snap = v.snapshot as CourseSnapshot;
  return flattenLessons(snap).flatMap((l) =>
    l.blocks.filter((b) => b.type === 'quiz' || b.type === 'assignment').map((b) => ({ id: b.id, type: b.type, title: b.title || l.title, lesson: l.title, week: l.week })),
  );
}

export async function teacherReviewQueue(teacherId: string, graded: boolean) {
  const myOfferings = await db.select({ id: offerings.id }).from(offerings).where(eq(offerings.teacherId, teacherId));
  const ids = myOfferings.map((o) => o.id);
  if (!ids.length) return [];
  return db
    .select({ submission: submissions, student: users, block: lessonBlocks, assignment: assignments, offering: offerings, discipline: disciplines })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.studentId))
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessonBlocks, eq(lessonBlocks.id, assignments.blockId))
    .innerJoin(offerings, eq(offerings.id, submissions.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .where(and(inArray(submissions.offeringId, ids), graded ? isNotNull(submissions.score) : isNull(submissions.score)))
    .orderBy(graded ? desc(submissions.gradedAt) : asc(submissions.submittedAt))
    .limit(500);
}

export async function lastActivity(offeringId: string) {
  const [r] = await db.select({ m: max(lessonProgress.lastSeenAt) }).from(lessonProgress).where(eq(lessonProgress.offeringId, offeringId));
  return r?.m ?? null;
}
