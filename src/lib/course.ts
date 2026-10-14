import 'server-only';
import { and, asc, eq, gte, inArray, isNull, max, or } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  academicPeriods,
  assignments,
  courseAuthors,
  courses,
  courseVersions,
  lessonBlocks,
  lessons,
  mediaAssets,
  modules,
  offerings,
  questionBanks,
  questionOptions,
  questions,
  quizzes,
  type BlockData,
  type BlockType,
  type LessonType,
} from '@/db/schema';
import type { SessionUser } from './auth';
import { departmentScope, inScope, userHasRole } from './rbac';
import { disciplines } from '@/db/schema';

export type SnapBlock = { id: string; type: BlockType; title: string; required: boolean; data: BlockData };
export type SnapLesson = { id: string; title: string; required: boolean; estMinutes: number | null; blocks: SnapBlock[] };
export type SnapModule = { id: string; week: number; title: string; lessons: SnapLesson[] };
export type CourseSnapshot = { courseId: string; title: string; language: string; description: string | null; modules: SnapModule[] };

/** Живое дерево курса для конструктора */
export async function loadCourseTree(courseId: string, tx: Tx | typeof db = db): Promise<CourseSnapshot | null> {
  const [course] = await tx.select().from(courses).where(eq(courses.id, courseId));
  if (!course) return null;
  const mods = await tx.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(asc(modules.position), asc(modules.week));
  const modIds = mods.map((m) => m.id);
  const less = modIds.length
    ? await tx.select().from(lessons).where(inArray(lessons.moduleId, modIds)).orderBy(asc(lessons.position))
    : [];
  const lessonIds = less.map((l) => l.id);
  const blocks = lessonIds.length
    ? await tx.select().from(lessonBlocks).where(inArray(lessonBlocks.lessonId, lessonIds)).orderBy(asc(lessonBlocks.position))
    : [];
  return {
    courseId,
    title: course.title,
    language: course.language,
    description: course.description,
    modules: mods.map((m) => ({
      id: m.id,
      week: m.week,
      title: m.title,
      lessons: less
        .filter((l) => l.moduleId === m.id)
        .map((l) => ({
          id: l.id,
          title: l.title,
          required: l.required,
          estMinutes: l.estMinutes,
          blocks: blocks
            .filter((b) => b.lessonId === l.id)
            .map((b) => ({ id: b.id, type: b.type, title: b.title, required: b.required, data: b.data })),
        })),
    })),
  };
}

export function flattenLessons(snap: CourseSnapshot) {
  return snap.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleId: m.id, moduleTitle: m.title, week: m.week })));
}

export function snapshotStats(snap: CourseSnapshot) {
  const ls = flattenLessons(snap);
  const blocks = ls.flatMap((l) => l.blocks);
  return {
    modules: snap.modules.length,
    lessons: ls.length,
    videos: blocks.filter((b) => b.type === 'video').length,
    quizzes: blocks.filter((b) => b.type === 'quiz').length,
    assignments: blocks.filter((b) => b.type === 'assignment').length,
    minutes: ls.reduce((s, l) => s + (l.estMinutes ?? 0), 0),
  };
}

/* ───────────────────────── Права на курс ───────────────────────── */

export type CourseAccess = { canView: boolean; canEdit: boolean; canApprove: boolean };

export async function courseAccess(user: SessionUser, courseId: string): Promise<CourseAccess & { course: typeof courses.$inferSelect | null }> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) return { canView: false, canEdit: false, canApprove: false, course: null };
  let departmentId: string | null = null;
  if (course.disciplineId) {
    const [d] = await db.select({ dep: disciplines.departmentId }).from(disciplines).where(eq(disciplines.id, course.disciplineId));
    departmentId = d?.dep ?? null;
  }
  const isOwner = course.ownerId === user.id;
  const [author] = await db
    .select()
    .from(courseAuthors)
    .where(and(eq(courseAuthors.courseId, courseId), eq(courseAuthors.userId, user.id)));
  const isAuthor = isOwner || !!author;
  const headScope = userHasRole(user, 'dept_head') ? await departmentScope(user, 'dept_head') : null;
  const isHead = !!headScope && (headScope.all || inScope(headScope, departmentId));
  const isOffice = userHasRole(user, 'academic_office') || userHasRole(user, 'admin');
  const canEdit = (isAuthor && userHasRole(user, 'author')) || isOffice || (course.isTemplate && userHasRole(user, 'academic_office'));
  return {
    course,
    canView: canEdit || isHead || userHasRole(user, 'rector') || userHasRole(user, 'dean') || userHasRole(user, 'teacher'),
    canEdit,
    canApprove: isHead || isOffice,
  };
}

/* ───────────────────────── Публикация ───────────────────────── */

/**
 * Публикация делает снимок версии: правки посреди семестра не ломают
 * прогресс — студенты видят опубликованную версию, пока не выйдет новая.
 * Курс подключается ко всем потокам своей дисциплины и языка в текущем
 * и будущих периодах.
 */
export async function publishCourse(courseId: string, approverId: string) {
  return db.transaction(async (tx) => {
    const snap = await loadCourseTree(courseId, tx);
    if (!snap) throw new Error('COURSE_NOT_FOUND');
    const [{ n }] = await tx.select({ n: max(courseVersions.number) }).from(courseVersions).where(eq(courseVersions.courseId, courseId));
    const [version] = await tx
      .insert(courseVersions)
      .values({ courseId, number: (n ?? 0) + 1, snapshot: snap, approvedBy: approverId })
      .returning();
    const [course] = await tx
      .update(courses)
      .set({ status: 'published', currentVersionId: version.id, reviewComment: null, updatedAt: new Date() })
      .where(eq(courses.id, courseId))
      .returning();
    const attached = await attachToOfferings(tx, course, version.id);
    return { version, attached };
  });
}

export async function attachToOfferings(tx: Tx, course: typeof courses.$inferSelect, versionId: string) {
  if (!course.disciplineId || course.isTemplate) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const periods = await tx.select({ id: academicPeriods.id }).from(academicPeriods).where(gte(academicPeriods.endsOn, today));
  if (periods.length === 0) return 0;
  const res = await tx
    .update(offerings)
    .set({ courseId: course.id, courseVersionId: versionId })
    .where(
      and(
        eq(offerings.disciplineId, course.disciplineId),
        eq(offerings.language, course.language),
        inArray(
          offerings.periodId,
          periods.map((p) => p.id),
        ),
        or(isNull(offerings.courseId), eq(offerings.courseId, course.id)),
      ),
    )
    .returning({ id: offerings.id });
  return res.length;
}

/** Снимок версии, которую видят студенты потока */
export async function offeringSnapshot(offeringId: string): Promise<{ snap: CourseSnapshot; versionId: string } | null> {
  const [row] = await db
    .select({ snapshot: courseVersions.snapshot, id: courseVersions.id })
    .from(offerings)
    .innerJoin(courseVersions, eq(courseVersions.id, offerings.courseVersionId))
    .where(eq(offerings.id, offeringId));
  return row ? { snap: row.snapshot as CourseSnapshot, versionId: row.id } : null;
}

/* ───────────────────────── Копирование ───────────────────────── */

/**
 * Копия курса на новый период или другой язык: структура, блоки, банки
 * вопросов, тесты и задания. Видео не перезаливаются — ссылки на те же ролики.
 */
export async function copyCourse(
  sourceId: string,
  opts: { title: string; language: 'kk' | 'ru' | 'en'; disciplineId: string | null; ownerId: string; isTemplate?: boolean },
) {
  return db.transaction(async (tx) => {
    const [src] = await tx.select().from(courses).where(eq(courses.id, sourceId));
    if (!src) throw new Error('COURSE_NOT_FOUND');
    const [dst] = await tx
      .insert(courses)
      .values({
        title: opts.title,
        language: opts.language,
        disciplineId: opts.disciplineId,
        description: src.description,
        ownerId: opts.ownerId,
        isTemplate: opts.isTemplate ?? false,
        status: 'draft',
      })
      .returning();
    await tx.insert(courseAuthors).values({ courseId: dst.id, userId: opts.ownerId, assignedBy: opts.ownerId }).onConflictDoNothing();

    // Банки вопросов
    const bankMap = new Map<string, string>();
    const banks = await tx.select().from(questionBanks).where(eq(questionBanks.courseId, sourceId));
    for (const b of banks) {
      const [nb] = await tx.insert(questionBanks).values({ courseId: dst.id, title: b.title }).returning();
      bankMap.set(b.id, nb.id);
      const qs = await tx.select().from(questions).where(eq(questions.bankId, b.id));
      for (const q of qs) {
        const [nq] = await tx.insert(questions).values({ bankId: nb.id, type: q.type, text: q.text, difficulty: q.difficulty, data: q.data }).returning();
        const opts2 = await tx.select().from(questionOptions).where(eq(questionOptions.questionId, q.id));
        if (opts2.length)
          await tx.insert(questionOptions).values(
            opts2.map((o) => ({ questionId: nq.id, text: o.text, isCorrect: o.isCorrect, position: o.position, matchText: o.matchText })),
          );
      }
    }

    const tree = await loadCourseTree(sourceId, tx);
    for (const [mi, m] of (tree?.modules ?? []).entries()) {
      const [nm] = await tx.insert(modules).values({ courseId: dst.id, week: m.week, position: mi, title: m.title }).returning();
      for (const [li, l] of m.lessons.entries()) {
        const [nl] = await tx
          .insert(lessons)
          .values({ moduleId: nm.id, position: li, title: l.title, required: l.required, estMinutes: l.estMinutes })
          .returning();
        for (const [bi, b] of l.blocks.entries()) {
          const [nbk] = await tx
            .insert(lessonBlocks)
            .values({ lessonId: nl.id, position: bi, type: b.type, title: b.title, required: b.required, data: b.data })
            .returning();
          if (b.type === 'quiz') {
            const [qz] = await tx.select().from(quizzes).where(eq(quizzes.blockId, b.id));
            if (qz) {
              const { id: _id, blockId: _b, bankId, ...rest } = qz;
              void _id;
              void _b;
              await tx.insert(quizzes).values({ ...rest, blockId: nbk.id, bankId: bankId ? (bankMap.get(bankId) ?? null) : null });
            }
          }
          if (b.type === 'assignment') {
            const [as] = await tx.select().from(assignments).where(eq(assignments.blockId, b.id));
            if (as) {
              const { id: _id, blockId: _b, ...rest } = as;
              void _id;
              void _b;
              await tx.insert(assignments).values({ ...rest, blockId: nbk.id });
            }
          }
        }
      }
    }
    return dst;
  });
}

/* ───────────────────────── Видео курса ───────────────────────── */

export async function courseVideoStats(courseId: string) {
  const rows = await db.select({ status: mediaAssets.status }).from(mediaAssets).where(eq(mediaAssets.courseId, courseId));
  return {
    total: rows.length,
    ready: rows.filter((r) => r.status === 'ready').length,
    processing: rows.filter((r) => r.status === 'processing' || r.status === 'uploading').length,
    error: rows.filter((r) => r.status === 'error').length,
  };
}

/* ───────────────────────── Контекст обучения студента ───────────────────────── */

const TYPE_PRIORITY: Record<LessonType, number> = { practice: 0, lab: 1, srop: 2, lecture: 3 };

/**
 * Студент записан на несколько потоков одной дисциплины (лекция + практика).
 * Курс один, поэтому прогресс и сдачи привязываются к одному «рабочему»
 * потоку: сначала практика (её ведёт преподаватель, который проверяет работы).
 */
export function pickContextOffering<T extends { lessonType: LessonType; courseId: string | null }>(list: T[]): T[] {
  const byCourse = new Map<string, T>();
  for (const o of list) {
    if (!o.courseId) continue;
    const prev = byCourse.get(o.courseId);
    if (!prev || TYPE_PRIORITY[o.lessonType] < TYPE_PRIORITY[prev.lessonType]) byCourse.set(o.courseId, o);
  }
  return [...byCourse.values()];
}
