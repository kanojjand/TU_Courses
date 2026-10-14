import 'server-only';
import { and, count, countDistinct, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  assignments,
  courses,
  departments,
  enrollments,
  faculties,
  disciplines,
  lessonBlocks,
  lessonProgress,
  lessons,
  mediaAssets,
  modules,
  offerings,
  quizAttempts,
  quizzes,
  students,
  submissions,
  userRoles,
} from '@/db/schema';
import { currentPeriodIds } from './analytics';

/** Ключевые показатели онлайн-обучения: для учебной части, ректората и лицензирования */
export async function universityIndicators() {
  const pids = await currentPeriodIds();
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const published = and(isNotNull(courses.currentVersionId), eq(courses.isTemplate, false));
  const [
    [studentsN],
    [teachersN],
    [discN],
    [discWithCourse],
    [coursesN],
    [lessonsN],
    [videosN],
    [videoSec],
    [quizzesN],
    [assignmentsN],
    [attemptsN],
    [submissionsN],
    [activeN],
    [covered],
  ] = await Promise.all([
    db.select({ n: count() }).from(students).where(eq(students.status, 'studying')),
    db.select({ n: countDistinct(userRoles.userId) }).from(userRoles).where(eq(userRoles.role, 'teacher')),
    pids.length ? db.select({ n: countDistinct(offerings.disciplineId) }).from(offerings).where(inArray(offerings.periodId, pids)) : [{ n: 0 }],
    pids.length
      ? db.select({ n: countDistinct(offerings.disciplineId) }).from(offerings).where(and(inArray(offerings.periodId, pids), isNotNull(offerings.courseVersionId)))
      : [{ n: 0 }],
    db.select({ n: count() }).from(courses).where(published),
    db.select({ n: count() }).from(lessons).innerJoin(modules, eq(modules.id, lessons.moduleId)).innerJoin(courses, eq(courses.id, modules.courseId)).where(published),
    db
      .select({ n: count() })
      .from(lessonBlocks)
      .innerJoin(lessons, eq(lessons.id, lessonBlocks.lessonId))
      .innerJoin(modules, eq(modules.id, lessons.moduleId))
      .innerJoin(courses, eq(courses.id, modules.courseId))
      .where(and(published, eq(lessonBlocks.type, 'video'))),
    db.select({ s: sql<number>`coalesce(sum(${mediaAssets.durationSec}), 0)::int` }).from(mediaAssets).where(eq(mediaAssets.status, 'ready')),
    db.select({ n: count() }).from(quizzes),
    db.select({ n: count() }).from(assignments),
    db.select({ n: count() }).from(quizAttempts).where(isNotNull(quizAttempts.finishedAt)),
    db.select({ n: count() }).from(submissions),
    db.select({ n: countDistinct(lessonProgress.studentId) }).from(lessonProgress).where(gte(lessonProgress.lastSeenAt, weekAgo)),
    pids.length
      ? db
          .select({ n: countDistinct(enrollments.studentId) })
          .from(enrollments)
          .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
          .where(and(inArray(offerings.periodId, pids), isNotNull(offerings.courseVersionId), eq(enrollments.status, 'active')))
      : [{ n: 0 }],
  ]);
  const s = studentsN?.n ?? 0;
  return {
    students: s,
    teachers: teachersN?.n ?? 0,
    disciplines: discN?.n ?? 0,
    withCourse: discWithCourse?.n ?? 0,
    courses: coursesN?.n ?? 0,
    lessons: lessonsN?.n ?? 0,
    videos: videosN?.n ?? 0,
    videoHours: Math.round(((videoSec?.s ?? 0) / 3600) * 10) / 10,
    quizzes: quizzesN?.n ?? 0,
    assignments: assignmentsN?.n ?? 0,
    attempts: attemptsN?.n ?? 0,
    submissions: submissionsN?.n ?? 0,
    activeWeek: activeN?.n ?? 0,
    coverage: s ? Math.round(((covered?.n ?? 0) / s) * 100) : 0,
  };
}

/** Готовность по факультетам: сколько потоков текущего семестра с курсом */
export async function readinessByFaculty() {
  const pids = await currentPeriodIds();
  if (!pids.length) return [];
  return db
    .select({
      faculty: faculties,
      offerings: count(offerings.id),
      withCourse: sql<number>`count(${offerings.id}) filter (where ${offerings.courseVersionId} is not null)::int`,
    })
    .from(offerings)
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(departments, eq(departments.id, disciplines.departmentId))
    .innerJoin(faculties, eq(faculties.id, departments.facultyId))
    .where(inArray(offerings.periodId, pids))
    .groupBy(faculties.id);
}
