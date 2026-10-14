import 'server-only';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { courseAuthors, courses, disciplines, lessons, modules, offerings, staff, users } from '@/db/schema';
import { courseVideoStats } from './course';
import { currentPeriodIds } from './analytics';
import type { Scope } from './rbac';

export async function departmentDisciplines(scope: Scope) {
  if (!scope.all && !scope.ids.length) return [];
  return db.select().from(disciplines).where(scope.all ? undefined : inArray(disciplines.departmentId, scope.ids)).orderBy(asc(disciplines.code));
}

/** Готовность курсов кафедры: по каждой дисциплине — курсы и их наполнение */
export async function readiness(scope: Scope) {
  const discs = await departmentDisciplines(scope);
  const dIds = discs.map((d) => d.id);
  if (!dIds.length) return { rows: [], withoutCourse: [] };
  const list = await db
    .select()
    .from(courses)
    .where(and(inArray(courses.disciplineId, dIds), eq(courses.isTemplate, false), ne(courses.status, 'archived')));
  const cIds = list.map((c) => c.id);
  const lessonCounts = cIds.length
    ? await db
        .select({ c: modules.courseId, n: sql<number>`count(${lessons.id})::int` })
        .from(modules)
        .leftJoin(lessons, eq(lessons.moduleId, modules.id))
        .where(inArray(modules.courseId, cIds))
        .groupBy(modules.courseId)
    : [];
  const authors = cIds.length
    ? await db
        .select({ c: courseAuthors.courseId, u: { id: users.id, lastName: users.lastName, firstName: users.firstName, middleName: users.middleName } })
        .from(courseAuthors)
        .innerJoin(users, eq(users.id, courseAuthors.userId))
        .where(inArray(courseAuthors.courseId, cIds))
    : [];
  const pids = await currentPeriodIds();
  const offs = pids.length
    ? await db
        .select({ d: offerings.disciplineId, lang: offerings.language, course: offerings.courseId })
        .from(offerings)
        .where(and(inArray(offerings.disciplineId, dIds), inArray(offerings.periodId, pids)))
    : [];
  const rows = await Promise.all(
    list.map(async (c) => ({
      course: c,
      discipline: discs.find((d) => d.id === c.disciplineId)!,
      lessons: lessonCounts.find((x) => x.c === c.id)?.n ?? 0,
      videos: await courseVideoStats(c.id),
      authors: authors.filter((a) => a.c === c.id).map((a) => a.u),
      streams: offs.filter((o) => o.course === c.id).length,
    })),
  );
  // Дисциплины, у которых в этом семестре есть потоки, но нет курса на нужном языке
  const withoutCourse: { discipline: (typeof discs)[number]; language: string; streams: number }[] = [];
  for (const d of discs) {
    const langs = [...new Set(offs.filter((o) => o.d === d.id && !o.course).map((o) => o.lang))];
    for (const lang of langs) {
      if (!list.some((c) => c.disciplineId === d.id && c.language === lang))
        withoutCourse.push({ discipline: d, language: lang, streams: offs.filter((o) => o.d === d.id && o.lang === lang).length });
    }
  }
  return { rows, withoutCourse };
}

export async function departmentStaff(scope: Scope) {
  return db
    .select({ id: users.id, lastName: users.lastName, firstName: users.firstName, middleName: users.middleName })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .where(scope.all ? undefined : inArray(staff.departmentId, scope.ids.length ? scope.ids : ['00000000-0000-0000-0000-000000000000']))
    .orderBy(asc(users.lastName));
}
