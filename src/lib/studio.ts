import 'server-only';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  assignments,
  courseAuthors,
  courses,
  courseVersions,
  disciplines,
  files,
  lessonBlocks,
  lessons,
  mediaAssets,
  modules,
  questionBanks,
  questions,
  quizzes,
} from '@/db/schema';
import type { SessionUser } from './auth';
import { courseVideoStats, loadCourseTree, type CourseSnapshot } from './course';
import { departmentScope, userHasRole } from './rbac';

export async function authorCourses(user: SessionUser) {
  const mine = await db.select({ c: courseAuthors.courseId }).from(courseAuthors).where(eq(courseAuthors.userId, user.id));
  const ids = mine.map((m) => m.c);
  const cond = [eq(courses.ownerId, user.id)];
  if (ids.length) cond.push(inArray(courses.id, ids));
  if (userHasRole(user, 'academic_office')) cond.push(eq(courses.isTemplate, true));
  const rows = await db
    .select({ course: courses, discipline: disciplines })
    .from(courses)
    .leftJoin(disciplines, eq(disciplines.id, courses.disciplineId))
    .where(and(or(...cond), sql`${courses.status} <> 'archived'`))
    .orderBy(desc(courses.updatedAt));
  return Promise.all(
    rows.map(async (r) => {
      const [lessonCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(lessons)
        .innerJoin(modules, eq(modules.id, lessons.moduleId))
        .where(eq(modules.courseId, r.course.id));
      return { ...r, lessons: lessonCount?.n ?? 0, videos: await courseVideoStats(r.course.id) };
    }),
  );
}

/** Дисциплины, для которых автор может создавать курсы */
export async function authorDisciplines(user: SessionUser) {
  const roles = ['author', 'academic_office', 'admin'] as const;
  if (roles.some((r) => r !== 'author' && userHasRole(user, r))) return db.select().from(disciplines).orderBy(asc(disciplines.nameRu));
  const scope = await departmentScope(user, 'author');
  if (scope.all) return db.select().from(disciplines).orderBy(asc(disciplines.nameRu));
  if (!scope.ids.length) return [];
  return db.select().from(disciplines).where(inArray(disciplines.departmentId, scope.ids)).orderBy(asc(disciplines.nameRu));
}

export async function builderTree(courseId: string) {
  const tree = await loadCourseTree(courseId);
  if (!tree) return [];
  return tree.modules.map((m) => ({
    id: m.id,
    week: m.week,
    title: m.title,
    lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, required: l.required, estMinutes: l.estMinutes, blocks: l.blocks.map((b) => b.type) })),
  }));
}

/** Отличается ли черновик от опубликованной версии */
export async function hasUnpublishedChanges(courseId: string, currentVersionId: string | null) {
  if (!currentVersionId) return false;
  const [v] = await db.select({ s: courseVersions.snapshot, n: courseVersions.number }).from(courseVersions).where(eq(courseVersions.id, currentVersionId));
  const live = await loadCourseTree(courseId);
  if (!v || !live) return false;
  // jsonb хранит ключи в своём порядке — сравниваем канонический JSON
  const canon = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, canon(val)])) : x;
  const norm = (s: CourseSnapshot) => JSON.stringify(canon(s.modules));
  return norm(v.s as CourseSnapshot) !== norm(live);
}

export async function currentVersionNumber(versionId: string | null) {
  if (!versionId) return null;
  const [v] = await db.select({ n: courseVersions.number }).from(courseVersions).where(eq(courseVersions.id, versionId));
  return v?.n ?? null;
}

export async function banksWithCounts(courseId: string) {
  const banks = await db.select().from(questionBanks).where(eq(questionBanks.courseId, courseId)).orderBy(asc(questionBanks.createdAt));
  if (!banks.length) return [];
  const counts = await db
    .select({ b: questions.bankId, d: questions.difficulty, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(inArray(questions.bankId, banks.map((b) => b.id)))
    .groupBy(questions.bankId, questions.difficulty);
  const c = (id: string, d: number) => counts.find((x) => x.b === id && x.d === d)?.n ?? 0;
  return banks.map((b) => ({ id: b.id, title: b.title, easy: c(b.id, 1), medium: c(b.id, 2), hard: c(b.id, 3) }));
}

export async function lessonEditorData(courseId: string, lessonId: string) {
  const [lesson] = await db
    .select({ lesson: lessons, module: modules })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(lessons.id, lessonId), eq(modules.courseId, courseId)));
  if (!lesson) return null;
  const blocks = await db.select().from(lessonBlocks).where(eq(lessonBlocks.lessonId, lessonId)).orderBy(asc(lessonBlocks.position));
  const blockIds = blocks.map((b) => b.id);
  const mediaIds = blocks.map((b) => b.data.mediaId).filter(Boolean) as string[];
  const fileIds = blocks.map((b) => b.data.fileId).filter(Boolean) as string[];
  const [media, fileRows, qz, asg] = await Promise.all([
    mediaIds.length ? db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds)) : [],
    fileIds.length ? db.select().from(files).where(inArray(files.id, fileIds)) : [],
    blockIds.length ? db.select().from(quizzes).where(inArray(quizzes.blockId, blockIds)) : [],
    blockIds.length ? db.select().from(assignments).where(inArray(assignments.blockId, blockIds)) : [],
  ]);
  return {
    lesson: lesson.lesson,
    module: lesson.module,
    blocks: blocks.map((b) => {
      const m = media.find((x) => x.id === b.data.mediaId);
      const f = fileRows.find((x) => x.id === b.data.fileId);
      const q = qz.find((x) => x.blockId === b.id);
      const a = asg.find((x) => x.blockId === b.id);
      return {
        id: b.id,
        type: b.type,
        title: b.title,
        required: b.required,
        html: b.data.html,
        url: b.data.url,
        description: b.data.description,
        file: f ? { id: f.id, name: f.filename, size: f.size } : null,
        media: m ? { id: m.id, filename: m.filename, status: m.status, provider: m.provider, url: m.url } : null,
        quiz: q
          ? { bankId: q.bankId, countEasy: q.countEasy, countMedium: q.countMedium, countHard: q.countHard, timeLimitMin: q.timeLimitMin, attemptsAllowed: q.attemptsAllowed, shuffle: q.shuffle, showResults: q.showResults }
          : null,
        assignment: a ? { instructions: a.instructions, criteria: a.criteria, maxScore: a.maxScore, allowedExt: a.allowedExt, maxFiles: a.maxFiles } : null,
      };
    }),
  };
}

export async function templates() {
  return db.select().from(courses).where(and(eq(courses.isTemplate, true), sql`${courses.status} <> 'archived'`)).orderBy(asc(courses.title));
}
