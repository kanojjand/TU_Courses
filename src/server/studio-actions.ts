'use server';

import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db';
import {
  assignments,
  courseAuthors,
  courses,
  disciplines,
  lessonBlocks,
  lessons,
  mediaAssets,
  modules,
  quizzes,
  userRoles,
  BLOCK_TYPES,
  type BlockData,
  type BlockType,
} from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { copyCourse, courseAccess, publishCourse } from '@/lib/course';
import { notify } from '@/lib/notify';
import { cleanHtml } from '@/lib/sanitize';
import { isUuid } from '@/lib/utils';

async function editable(courseId: string) {
  const user = await requireUser();
  if (!isUuid(courseId)) throw new Error('BAD_REQUEST');
  const acc = await courseAccess(user, courseId);
  if (!acc.canEdit || !acc.course) throw new Error('FORBIDDEN');
  return { user, course: acc.course };
}

async function touch(courseId: string) {
  await db.update(courses).set({ updatedAt: new Date() }).where(eq(courses.id, courseId));
  revalidatePath(`/studio/${courseId}`);
}

async function courseOfModule(moduleId: string) {
  const [m] = await db.select({ c: modules.courseId }).from(modules).where(eq(modules.id, moduleId));
  if (!m) throw new Error('NOT_FOUND');
  return m.c;
}
async function courseOfLesson(lessonId: string) {
  const [l] = await db.select({ c: modules.courseId }).from(lessons).innerJoin(modules, eq(modules.id, lessons.moduleId)).where(eq(lessons.id, lessonId));
  if (!l) throw new Error('NOT_FOUND');
  return l.c;
}
async function courseOfBlock(blockId: string) {
  const [b] = await db
    .select({ c: modules.courseId, lessonId: lessons.id })
    .from(lessonBlocks)
    .innerJoin(lessons, eq(lessons.id, lessonBlocks.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(lessonBlocks.id, blockId));
  if (!b) throw new Error('NOT_FOUND');
  return b;
}

/* ───────────────────────── Курс ───────────────────────── */

const CreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  language: z.enum(['kk', 'ru', 'en']),
  disciplineId: z.string().uuid().nullable(),
  from: z.enum(['empty', 'template', 'copy', 'archive']),
  sourceId: z.string().uuid().nullable(),
});

export async function createCourseAction(input: z.input<typeof CreateSchema>) {
  const user = await requireUser();
  if (!user.roles.some((r) => ['author', 'academic_office', 'admin'].includes(r.role))) throw new Error('FORBIDDEN');
  const data = CreateSchema.parse(input);
  let courseId: string;
  if ((data.from === 'template' || data.from === 'copy') && data.sourceId) {
    const src = await courseAccess(user, data.sourceId);
    if (!src.course || (data.from === 'copy' && !src.canEdit) || (data.from === 'template' && !src.course.isTemplate)) throw new Error('FORBIDDEN');
    const copy = await copyCourse(data.sourceId, { title: data.title, language: data.language, disciplineId: data.disciplineId, ownerId: user.id });
    courseId = copy.id;
  } else {
    const isTemplate = data.disciplineId === null && user.roles.some((r) => r.role === 'academic_office');
    const [c] = await db
      .insert(courses)
      .values({ title: data.title, language: data.language, disciplineId: data.disciplineId, ownerId: user.id, status: 'draft', isTemplate })
      .returning();
    await db.insert(courseAuthors).values({ courseId: c.id, userId: user.id, assignedBy: user.id });
    courseId = c.id;
  }
  await audit(user.id, 'course.create', 'course', courseId, null, data);
  redirect(data.from === 'archive' ? `/studio/${courseId}/import` : `/studio/${courseId}`);
}

const SettingsSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(4000).nullable(),
  language: z.enum(['kk', 'ru', 'en']),
  disciplineId: z.string().uuid().nullable(),
});

export async function updateCourseAction(courseId: string, input: z.input<typeof SettingsSchema>) {
  const { user, course } = await editable(courseId);
  const data = SettingsSchema.parse(input);
  await db.update(courses).set({ ...data, updatedAt: new Date() }).where(eq(courses.id, courseId));
  await audit(user.id, 'course.update', 'course', courseId, { title: course.title }, data);
  revalidatePath(`/studio/${courseId}`);
  return { ok: true as const };
}

export async function copyCourseAction(courseId: string, input: { title: string; language: 'kk' | 'ru' | 'en'; disciplineId: string | null }) {
  const { user } = await editable(courseId);
  const copy = await copyCourse(courseId, { ...input, ownerId: user.id });
  await audit(user.id, 'course.copy', 'course', copy.id, { from: courseId }, input);
  redirect(`/studio/${copy.id}`);
}

/* ───────────────────────── Статусы ───────────────────────── */

export async function submitForReviewAction(courseId: string) {
  const { user, course } = await editable(courseId);
  // Опубликованный курс остаётся у студентов в прежней версии, пока кафедра не утвердит новую
  await db.update(courses).set({ status: 'review', reviewComment: null, updatedAt: new Date() }).where(eq(courses.id, courseId));
  // Заведующим кафедрой дисциплины
  let heads: string[] = [];
  if (course.disciplineId) {
    const [d] = await db.select({ dep: disciplines.departmentId }).from(disciplines).where(eq(disciplines.id, course.disciplineId));
    if (d?.dep) {
      const rows = await db
        .select({ u: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.role, 'dept_head'), eq(userRoles.scopeType, 'department'), eq(userRoles.scopeId, d.dep)));
      heads = rows.map((r) => r.u);
    }
  }
  await notify(heads, 'courseSubmitted', { course: course.title }, `/department`);
  await audit(user.id, 'course.submit', 'course', courseId);
  revalidatePath(`/studio/${courseId}`);
  return { ok: true as const };
}

async function approver(courseId: string) {
  const user = await requireUser();
  const acc = await courseAccess(user, courseId);
  if (!acc.canApprove || !acc.course) throw new Error('FORBIDDEN');
  return { user, course: acc.course };
}

export async function publishCourseAction(courseId: string) {
  const { user, course } = await approver(courseId);
  const { version, attached } = await publishCourse(courseId, user.id);
  await audit(user.id, 'course.publish', 'course', courseId, null, { version: version.number, attached });
  const authors = await db.select({ u: courseAuthors.userId }).from(courseAuthors).where(eq(courseAuthors.courseId, courseId));
  await notify(authors.map((a) => a.u).filter((u) => u !== user.id), 'courseApproved', { course: course.title }, `/studio/${courseId}`);
  revalidatePath(`/studio/${courseId}`);
  revalidatePath('/department');
  return { ok: true as const, version: version.number, attached };
}

export async function returnCourseAction(courseId: string, comment: string) {
  const { user, course } = await approver(courseId);
  await db
    .update(courses)
    .set({ status: course.currentVersionId ? 'published' : 'draft', reviewComment: comment.trim().slice(0, 2000) || null, updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  const authors = await db.select({ u: courseAuthors.userId }).from(courseAuthors).where(eq(courseAuthors.courseId, courseId));
  await notify(authors.map((a) => a.u), 'courseReturned', { course: course.title }, `/studio/${courseId}`);
  await audit(user.id, 'course.return', 'course', courseId, null, { comment });
  revalidatePath(`/studio/${courseId}`);
  revalidatePath('/department');
  return { ok: true as const };
}

/* ───────────────────────── Модули ───────────────────────── */

export async function addModuleAction(courseId: string, title: string) {
  await editable(courseId);
  const [m] = await db.select({ p: max(modules.position), w: max(modules.week) }).from(modules).where(eq(modules.courseId, courseId));
  const [row] = await db
    .insert(modules)
    .values({ courseId, title: title.trim() || '—', position: (m?.p ?? -1) + 1, week: (m?.w ?? 0) + 1 })
    .returning();
  await touch(courseId);
  return row;
}

export async function updateModuleAction(moduleId: string, data: { title?: string; week?: number }) {
  const courseId = await courseOfModule(moduleId);
  await editable(courseId);
  const set: Partial<typeof modules.$inferInsert> = {};
  if (data.title !== undefined) set.title = data.title.trim().slice(0, 200) || '—';
  if (data.week !== undefined && Number.isInteger(data.week) && data.week >= 1 && data.week <= 60) set.week = data.week;
  if (Object.keys(set).length) await db.update(modules).set(set).where(eq(modules.id, moduleId));
  await touch(courseId);
  return { ok: true as const };
}

export async function deleteModuleAction(moduleId: string) {
  const courseId = await courseOfModule(moduleId);
  const { user } = await editable(courseId);
  await db.delete(modules).where(eq(modules.id, moduleId));
  await audit(user.id, 'module.delete', 'module', moduleId);
  await touch(courseId);
  return { ok: true as const };
}

export async function reorderModulesAction(courseId: string, ids: string[]) {
  await editable(courseId);
  const own = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
  const set = new Set(own.map((o) => o.id));
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.filter((x) => set.has(x)).entries()) await tx.update(modules).set({ position: i }).where(eq(modules.id, id));
  });
  await touch(courseId);
  return { ok: true as const };
}

/* ───────────────────────── Уроки ───────────────────────── */

export async function addLessonAction(moduleId: string, title: string) {
  const courseId = await courseOfModule(moduleId);
  await editable(courseId);
  const [m] = await db.select({ p: max(lessons.position) }).from(lessons).where(eq(lessons.moduleId, moduleId));
  const [row] = await db
    .insert(lessons)
    .values({ moduleId, title: title.trim() || '—', position: (m?.p ?? -1) + 1, required: true })
    .returning();
  await touch(courseId);
  return row;
}

export async function updateLessonAction(lessonId: string, data: { title?: string; required?: boolean; estMinutes?: number | null }) {
  const courseId = await courseOfLesson(lessonId);
  await editable(courseId);
  const set: Partial<typeof lessons.$inferInsert> = {};
  if (data.title !== undefined) set.title = data.title.trim().slice(0, 200) || '—';
  if (data.required !== undefined) set.required = data.required;
  if (data.estMinutes !== undefined) set.estMinutes = data.estMinutes && data.estMinutes > 0 && data.estMinutes < 1000 ? Math.round(data.estMinutes) : null;
  if (Object.keys(set).length) await db.update(lessons).set(set).where(eq(lessons.id, lessonId));
  await touch(courseId);
  return { ok: true as const };
}

export async function deleteLessonAction(lessonId: string) {
  const courseId = await courseOfLesson(lessonId);
  const { user } = await editable(courseId);
  await db.delete(lessons).where(eq(lessons.id, lessonId));
  await audit(user.id, 'lesson.delete', 'lesson', lessonId);
  await touch(courseId);
  return { ok: true as const };
}

/** Порядок уроков; урок можно перенести в другой модуль того же курса */
export async function reorderLessonsAction(moduleId: string, ids: string[]) {
  const courseId = await courseOfModule(moduleId);
  await editable(courseId);
  const valid = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, courseId), inArray(lessons.id, ids.filter(isUuid))));
  const set = new Set(valid.map((v) => v.id));
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.filter((x) => set.has(x)).entries()) await tx.update(lessons).set({ position: i, moduleId }).where(eq(lessons.id, id));
  });
  await touch(courseId);
  return { ok: true as const };
}

/* ───────────────────────── Блоки ───────────────────────── */

export async function addBlockAction(lessonId: string, type: BlockType) {
  if (!BLOCK_TYPES.includes(type)) throw new Error('BAD_REQUEST');
  const courseId = await courseOfLesson(lessonId);
  await editable(courseId);
  const [m] = await db.select({ p: max(lessonBlocks.position) }).from(lessonBlocks).where(eq(lessonBlocks.lessonId, lessonId));
  const [row] = await db
    .insert(lessonBlocks)
    .values({ lessonId, type, title: '', position: (m?.p ?? -1) + 1, required: type === 'video' || type === 'quiz' || type === 'assignment', data: {} })
    .returning();
  if (type === 'quiz') await db.insert(quizzes).values({ blockId: row.id });
  if (type === 'assignment') await db.insert(assignments).values({ blockId: row.id });
  await touch(courseId);
  revalidatePath(`/studio/${courseId}/lessons/${lessonId}`);
  return row;
}

const BlockUpdate = z.object({
  title: z.string().max(300).optional(),
  required: z.boolean().optional(),
  html: z.string().max(400_000).optional(),
  url: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  fileId: z.string().uuid().nullable().optional(),
});

export async function updateBlockAction(blockId: string, input: z.input<typeof BlockUpdate>) {
  const { c: courseId, lessonId } = await courseOfBlock(blockId);
  await editable(courseId);
  const data = BlockUpdate.parse(input);
  const [block] = await db.select().from(lessonBlocks).where(eq(lessonBlocks.id, blockId));
  const next: BlockData = { ...block.data };
  if (data.html !== undefined) next.html = cleanHtml(data.html);
  if (data.url !== undefined) {
    const u = data.url.trim();
    next.url = u && !/^https?:\/\//i.test(u) ? `https://${u}` : u;
  }
  if (data.description !== undefined) next.description = data.description.trim();
  if (data.fileId !== undefined) next.fileId = data.fileId ?? undefined;
  await db
    .update(lessonBlocks)
    .set({
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.required !== undefined ? { required: data.required } : {}),
      data: next,
    })
    .where(eq(lessonBlocks.id, blockId));
  await touch(courseId);
  revalidatePath(`/studio/${courseId}/lessons/${lessonId}`);
  return { ok: true as const };
}

export async function deleteBlockAction(blockId: string) {
  const { c: courseId, lessonId } = await courseOfBlock(blockId);
  const { user } = await editable(courseId);
  await db.delete(lessonBlocks).where(eq(lessonBlocks.id, blockId));
  await audit(user.id, 'block.delete', 'block', blockId);
  await touch(courseId);
  revalidatePath(`/studio/${courseId}/lessons/${lessonId}`);
  return { ok: true as const };
}

export async function reorderBlocksAction(lessonId: string, ids: string[]) {
  const courseId = await courseOfLesson(lessonId);
  await editable(courseId);
  const own = await db.select({ id: lessonBlocks.id }).from(lessonBlocks).where(eq(lessonBlocks.lessonId, lessonId));
  const set = new Set(own.map((o) => o.id));
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.filter((x) => set.has(x)).entries()) await tx.update(lessonBlocks).set({ position: i }).where(eq(lessonBlocks.id, id));
  });
  await touch(courseId);
  return { ok: true as const };
}

const QuizSettings = z.object({
  bankId: z.string().uuid().nullable(),
  countEasy: z.number().int().min(0).max(200),
  countMedium: z.number().int().min(0).max(200),
  countHard: z.number().int().min(0).max(200),
  timeLimitMin: z.number().int().min(1).max(600).nullable(),
  attemptsAllowed: z.number().int().min(1).max(20),
  shuffle: z.boolean(),
  showResults: z.boolean(),
});

export async function saveQuizSettingsAction(blockId: string, input: z.input<typeof QuizSettings>) {
  const { c: courseId } = await courseOfBlock(blockId);
  await editable(courseId);
  const data = QuizSettings.parse(input);
  await db.insert(quizzes).values({ blockId, ...data }).onConflictDoUpdate({ target: quizzes.blockId, set: data });
  await touch(courseId);
  return { ok: true as const };
}

const AssignmentSettings = z.object({
  instructions: z.string().max(10_000).nullable(),
  criteria: z.string().max(5000).nullable(),
  maxScore: z.number().int().min(1).max(1000),
  allowedExt: z.string().max(300),
  maxFiles: z.number().int().min(1).max(20),
});

export async function saveAssignmentSettingsAction(blockId: string, input: z.input<typeof AssignmentSettings>) {
  const { c: courseId } = await courseOfBlock(blockId);
  await editable(courseId);
  const data = AssignmentSettings.parse(input);
  data.allowedExt = data.allowedExt
    .split(/[,\s;]+/)
    .map((x) => x.replace(/^\./, '').toLowerCase())
    .filter((x) => /^[a-z0-9]{1,8}$/.test(x))
    .join(',');
  await db.insert(assignments).values({ blockId, ...data }).onConflictDoUpdate({ target: assignments.blockId, set: data });
  await touch(courseId);
  return { ok: true as const };
}

/** Видео по ссылке (YouTube, mp4) — пока Bunny не подключён или для внешних материалов */
export async function setExternalVideoAction(blockId: string, url: string) {
  const { c: courseId } = await courseOfBlock(blockId);
  const { user } = await editable(courseId);
  const clean = url.trim();
  if (!/^https?:\/\/\S+$/i.test(clean)) return { error: 'badUrl' as const };
  const [m] = await db.insert(mediaAssets).values({ provider: 'external', url: clean, filename: clean.split('/').pop()?.slice(0, 120), status: 'ready', ownerId: user.id, courseId }).returning();
  const [block] = await db.select().from(lessonBlocks).where(eq(lessonBlocks.id, blockId));
  await db.update(lessonBlocks).set({ data: { ...block.data, mediaId: m.id } }).where(eq(lessonBlocks.id, blockId));
  await touch(courseId);
  return { ok: true as const };
}

export async function lessonsOfCourse(courseId: string) {
  await editable(courseId);
  return db
    .select({ id: lessons.id, title: lessons.title, moduleId: modules.id })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(lessons.position));
}
