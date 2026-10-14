'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { assignments, gradeItems, grades, lessonBlocks, offerings, submissions, GRADE_COMPONENTS, type GradeComponent } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { confirmSheet, createDefaultItems, defaultHardClose, teacherSetGrade, usersWithRole, writeAutoGrade } from '@/lib/grades';
import { notify } from '@/lib/notify';
import { recomputeLesson, schemeForOffering } from '@/lib/progress';
import { flattenLessons, offeringSnapshot } from '@/lib/course';
import { applyLateRule, clampScore } from '@/lib/rules/deadlines';
import { isUuid } from '@/lib/utils';

async function ownOffering(offeringId: string) {
  const user = await requireUser();
  if (!isUuid(offeringId)) throw new Error('BAD_REQUEST');
  const [off] = await db.select().from(offerings).where(eq(offerings.id, offeringId));
  if (!off || off.teacherId !== user.id) throw new Error('FORBIDDEN');
  return { user, off };
}

export async function setGradeAction(itemId: string, studentId: string, score: number | null, reason?: string) {
  const user = await requireUser();
  if (!isUuid(itemId) || !isUuid(studentId)) return { status: 'invalid' as const };
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return { status: 'invalid' as const };
  const res = await teacherSetGrade({ actorId: user.id, itemId, studentId, score, reason });
  const [item] = await db.select({ o: gradeItems.offeringId }).from(gradeItems).where(eq(gradeItems.id, itemId));
  if (item) revalidatePath(`/teach/${item.o}`);
  return res;
}

const ItemSchema = z.object({
  component: z.enum(GRADE_COMPONENTS),
  title: z.string().trim().min(1).max(200),
  blockId: z.string().uuid().nullable(),
  opensAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  hardCloseAt: z.string().nullable(),
});

const toDate = (v: string | null) => (v ? new Date(v) : null);

export async function saveGradeItemAction(offeringId: string, itemId: string | null, input: z.input<typeof ItemSchema>) {
  const { user } = await ownOffering(offeringId);
  const data = ItemSchema.parse(input);
  const values = {
    component: data.component as GradeComponent,
    title: data.title,
    blockId: data.blockId,
    opensAt: toDate(data.opensAt),
    dueAt: toDate(data.dueAt),
    hardCloseAt: toDate(data.hardCloseAt) ?? (await defaultHardClose(offeringId, data.component)),
  };
  if (itemId) {
    const [before] = await db.select().from(gradeItems).where(and(eq(gradeItems.id, itemId), eq(gradeItems.offeringId, offeringId)));
    if (!before) return { error: 'notFound' as const };
    await db.update(gradeItems).set(values).where(eq(gradeItems.id, itemId));
    await audit(user.id, 'grade_item.update', 'grade_item', itemId, before, values);
  } else {
    const pos = { TK1: 0, RK1: 10, TK2: 20, RK2: 30, EXAM: 40 }[data.component] + 5;
    const [row] = await db.insert(gradeItems).values({ ...values, offeringId, position: pos }).returning();
    await audit(user.id, 'grade_item.create', 'grade_item', row.id, null, values);
  }
  revalidatePath(`/teach/${offeringId}`);
  return { ok: true as const };
}

export async function deleteGradeItemAction(offeringId: string, itemId: string) {
  const { user } = await ownOffering(offeringId);
  const [item] = await db.select().from(gradeItems).where(and(eq(gradeItems.id, itemId), eq(gradeItems.offeringId, offeringId)));
  if (!item) return { error: 'notFound' as const };
  const locked = await db.select({ id: grades.id }).from(grades).where(and(eq(grades.gradeItemId, itemId), eq(grades.status, 'confirmed'))).limit(1);
  if (locked.length) return { error: 'locked' as const };
  await db.delete(gradeItems).where(eq(gradeItems.id, itemId));
  await audit(user.id, 'grade_item.delete', 'grade_item', itemId, item, null);
  revalidatePath(`/teach/${offeringId}`);
  return { ok: true as const };
}

export async function createDefaultItemsAction(offeringId: string) {
  await ownOffering(offeringId);
  const n = await createDefaultItems(offeringId);
  revalidatePath(`/teach/${offeringId}`);
  return { created: n };
}

/** Проверка задания: балл из максимума задания → 0–100, правило поздней сдачи, оценка в журналы */
export async function gradeSubmissionAction(submissionId: string, rawPoints: number, feedback: string) {
  const user = await requireUser();
  if (!isUuid(submissionId)) return { error: 'invalid' as const };
  const [row] = await db
    .select({ sub: submissions, as: assignments, off: offerings, block: lessonBlocks })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessonBlocks, eq(lessonBlocks.id, assignments.blockId))
    .innerJoin(offerings, eq(offerings.id, submissions.offeringId))
    .where(eq(submissions.id, submissionId));
  if (!row || row.off.teacherId !== user.id) return { error: 'forbidden' as const };
  if (!Number.isFinite(rawPoints) || rawPoints < 0 || rawPoints > row.as.maxScore) return { error: 'invalid' as const };
  const score100 = clampScore((rawPoints / row.as.maxScore) * 100);
  await db
    .update(submissions)
    .set({ score: score100, feedback: feedback.trim() || null, gradedBy: user.id, gradedAt: new Date() })
    .where(eq(submissions.id, submissionId));
  // В журнал — по времени сдачи, чтобы «поздно» считалось от момента сдачи, а не проверки
  await writeAutoGrade(row.sub.studentId, row.block.id, score100, row.sub.submittedAt, 'replace');
  const scheme = await schemeForOffering(row.off.id);
  const snap = await offeringSnapshot(row.off.id);
  const lesson = snap && flattenLessons(snap.snap).find((l) => l.blocks.some((b) => b.id === row.block.id));
  if (lesson) await recomputeLesson(row.sub.studentId, row.off.id, lesson, scheme.videoThreshold);
  await audit(user.id, 'submission.grade', 'submission', submissionId, { score: row.sub.score }, { score: score100 });
  const finalScore = applyLateRule(score100, row.sub.isLate, scheme);
  await notify([row.sub.studentId], 'submissionGraded', { item: row.block.title, score: finalScore }, `/learn/${row.off.id}/${lesson?.id ?? ''}`);
  revalidatePath('/teach/review');
  return { ok: true as const, score: finalScore };
}

export async function confirmSheetAction(offeringId: string, component: GradeComponent) {
  const { user } = await ownOffering(offeringId);
  try {
    await confirmSheet(offeringId, component, user.id);
  } catch (e) {
    const msg = (e as Error).message;
    return { error: msg === 'ALREADY_CONFIRMED' ? ('already' as const) : msg === 'NO_ITEMS' ? ('noItems' as const) : ('failed' as const) };
  }
  await notify(await usersWithRole('registrar'), 'sheetReady', { component }, '/registrar/sheets');
  revalidatePath(`/teach/${offeringId}/sheets`);
  revalidatePath('/teach/sheets');
  return { ok: true as const };
}
