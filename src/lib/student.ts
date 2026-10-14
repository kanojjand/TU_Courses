import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicPeriods,
  assignments,
  courseVersions,
  disciplines,
  enrollments,
  gradeItems,
  grades,
  lessonBlocks,
  lessonProgress,
  videoProgress,
  offerings,
  quizAttempts,
  quizzes,
  submissions,
  users,
} from '@/db/schema';
import { flattenLessons, pickContextOffering, type CourseSnapshot } from './course';
import { schemeForOffering, studentCourseProgress } from './progress';
import { rkAdmission } from './rules/admission';
import { admissionRating, componentScores } from './rules/rating';
import { timingAt } from './rules/deadlines';

export type StudentOffering = Awaited<ReturnType<typeof studentOfferings>>[number];

/** Активные потоки студента в текущих и будущих периодах */
export async function studentOfferings(studentId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      offering: offerings,
      discipline: disciplines,
      teacher: { id: users.id, lastName: users.lastName, firstName: users.firstName, middleName: users.middleName },
      periodEnds: academicPeriods.endsOn,
    })
    .from(enrollments)
    .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(academicPeriods, eq(academicPeriods.id, offerings.periodId))
    .leftJoin(users, eq(users.id, offerings.teacherId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')))
    .orderBy(asc(disciplines.nameRu));
  return rows.filter((r) => r.periodEnds >= today);
}

/** Курсы студента: один курс на дисциплину, с прогрессом */
export async function studentCourses(studentId: string) {
  const offs = await studentOfferings(studentId);
  const contexts = pickContextOffering(offs.map((o) => ({ ...o.offering, row: o })));
  const versionIds = contexts.map((c) => c.courseVersionId).filter(Boolean) as string[];
  const versions = versionIds.length ? await db.select().from(courseVersions).where(inArray(courseVersions.id, versionIds)) : [];
  const snapById = new Map(versions.map((v) => [v.id, v.snapshot as CourseSnapshot]));
  const withCourse = await Promise.all(
    contexts.map(async (c) => {
      const snap = c.courseVersionId ? snapById.get(c.courseVersionId) : undefined;
      const progress = snap ? await studentCourseProgress(studentId, snap) : null;
      return { offering: c.row.offering, discipline: c.row.discipline, teacher: c.row.teacher, snap: snap ?? null, progress };
    }),
  );
  // Дисциплины, к которым курс ещё не подключён
  const covered = new Set(contexts.map((c) => c.row.discipline.id));
  const pending = new Map<string, StudentOffering>();
  for (const o of offs) if (!covered.has(o.discipline.id) && !pending.has(o.discipline.id)) pending.set(o.discipline.id, o);
  return { courses: withCourse, pending: [...pending.values()], offerings: offs };
}

export type DeadlineItem = {
  itemId: string;
  title: string;
  component: string;
  offeringId: string;
  disciplineName: { nameKk: string; nameRu: string; nameEn: string };
  blockId: string | null;
  blockType: string | null;
  lessonId: string | null;
  dueAt: Date | null;
  hardCloseAt: Date | null;
  opensAt: Date | null;
  timing: ReturnType<typeof timingAt>;
  done: boolean;
  score: number | null;
};

/** Элементы оценивания студента со сроками и отметкой «сдано» */
export async function studentDeadlines(studentId: string): Promise<DeadlineItem[]> {
  const offs = await studentOfferings(studentId);
  const offIds = offs.map((o) => o.offering.id);
  if (!offIds.length) return [];
  const items = await db
    .select({ item: gradeItems, blockType: lessonBlocks.type, lessonId: lessonBlocks.lessonId })
    .from(gradeItems)
    .leftJoin(lessonBlocks, eq(lessonBlocks.id, gradeItems.blockId))
    .where(inArray(gradeItems.offeringId, offIds))
    .orderBy(asc(gradeItems.dueAt));
  const itemIds = items.map((i) => i.item.id);
  const blockIds = items.map((i) => i.item.blockId).filter(Boolean) as string[];
  const [myGrades, myQuiz, mySubs] = await Promise.all([
    itemIds.length ? db.select().from(grades).where(and(eq(grades.studentId, studentId), inArray(grades.gradeItemId, itemIds))) : [],
    blockIds.length
      ? db
          .select({ blockId: quizzes.blockId })
          .from(quizAttempts)
          .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
          .where(and(eq(quizAttempts.studentId, studentId), inArray(quizzes.blockId, blockIds), isNotNull(quizAttempts.finishedAt)))
      : [],
    blockIds.length
      ? db
          .select({ blockId: assignments.blockId })
          .from(submissions)
          .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
          .where(and(eq(submissions.studentId, studentId), inArray(assignments.blockId, blockIds)))
      : [],
  ]);
  const gradeByItem = new Map(myGrades.map((g) => [g.gradeItemId, g.score]));
  const doneBlocks = new Set([...myQuiz.map((q) => q.blockId), ...mySubs.map((s) => s.blockId)]);
  const offById = new Map(offs.map((o) => [o.offering.id, o]));
  const now = new Date();
  return items.map(({ item, blockType, lessonId }) => ({
    itemId: item.id,
    title: item.title,
    component: item.component,
    offeringId: item.offeringId,
    disciplineName: offById.get(item.offeringId)!.discipline,
    blockId: item.blockId,
    blockType: blockType ?? null,
    lessonId: lessonId ?? null,
    dueAt: item.dueAt,
    hardCloseAt: item.hardCloseAt,
    opensAt: item.opensAt,
    timing: timingAt(item, now),
    done: (item.blockId ? doneBlocks.has(item.blockId) : false) || gradeByItem.has(item.id),
    score: gradeByItem.get(item.id) ?? null,
  }));
}

export async function recentGrades(studentId: string, limit = 5) {
  return db
    .select({ grade: grades, item: gradeItems, discipline: disciplines })
    .from(grades)
    .innerJoin(gradeItems, eq(gradeItems.id, grades.gradeItemId))
    .innerJoin(offerings, eq(offerings.id, gradeItems.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .where(eq(grades.studentId, studentId))
    .orderBy(desc(grades.updatedAt))
    .limit(limit);
}

/** Поток доступен студенту: он записан и поток активен */
export async function studentOffering(studentId: string, offeringId: string) {
  const [row] = await db
    .select({ offering: offerings, discipline: disciplines, teacher: users })
    .from(enrollments)
    .innerJoin(offerings, eq(offerings.id, enrollments.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .leftJoin(users, eq(users.id, offerings.teacherId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.offeringId, offeringId), eq(enrollments.status, 'active')));
  return row ?? null;
}

/* ───────────────────────── Оценки студента ───────────────────────── */

export async function studentGradebook(studentId: string) {
  const { courses: myCourses, offerings: offs } = await studentCourses(studentId);
  const offIds = offs.map((o) => o.offering.id);
  if (!offIds.length) return [];
  const items = await db.select().from(gradeItems).where(inArray(gradeItems.offeringId, offIds)).orderBy(asc(gradeItems.position));
  const itemIds = items.map((i) => i.id);
  const myGrades = itemIds.length ? await db.select().from(grades).where(and(eq(grades.studentId, studentId), inArray(grades.gradeItemId, itemIds))) : [];
  const gByItem = new Map(myGrades.map((g) => [g.gradeItemId, g]));

  return Promise.all(
    offs.map(async (o) => {
      const its = items.filter((i) => i.offeringId === o.offering.id);
      const scheme = await schemeForOffering(o.offering.id);
      const scores = new Map<string, number>();
      its.forEach((i) => {
        const g = gByItem.get(i.id);
        if (g) scores.set(i.id, g.score);
      });
      const comps = componentScores(its, scores);
      const rating = admissionRating(comps, scheme);
      // Допуск к РК — по курсу дисциплины
      const course = myCourses.find((c) => c.discipline.id === o.discipline.id && c.snap);
      let rk: { rk1: ReturnType<typeof rkAdmission>; rk2: ReturnType<typeof rkAdmission> } | null = null;
      if (course?.snap) {
        const ls = flattenLessons(course.snap);
        const videos = ls.flatMap((l) => l.blocks.filter((b) => b.type === 'video').map((b) => ({ blockId: b.id, lessonId: l.id, week: l.week, required: b.required })));
        const lessonIds = ls.map((l) => l.id);
        const [done, vp] = await Promise.all([
          lessonIds.length
            ? db
                .select({ id: lessonProgress.lessonId })
                .from(lessonProgress)
                .where(and(eq(lessonProgress.studentId, studentId), inArray(lessonProgress.lessonId, lessonIds), eq(lessonProgress.status, 'completed')))
            : [],
          videos.length
            ? db
                .select({ b: videoProgress.blockId, p: videoProgress.percent })
                .from(videoProgress)
                .where(and(eq(videoProgress.studentId, studentId), inArray(videoProgress.blockId, videos.map((v) => v.blockId))))
            : [],
        ]);
        const base = {
          lessons: ls.map((l) => ({ id: l.id, week: l.week, required: l.required })),
          completedLessonIds: new Set(done.map((d) => d.id)),
          videos,
          videoPercent: new Map(vp.map((v) => [v.b, v.p])),
          videoThreshold: scheme.videoThreshold,
        };
        rk = { rk1: rkAdmission({ ...base, rkWeek: scheme.rk1Week }), rk2: rkAdmission({ ...base, rkWeek: scheme.rk2Week }) };
      }
      return {
        offering: o.offering,
        discipline: o.discipline,
        teacher: o.teacher,
        items: its.map((i) => ({ item: i, grade: gByItem.get(i.id) ?? null })),
        comps,
        rating,
        scheme,
        rk,
      };
    }),
  );
}
