'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { questionBanks, questionOptions, questions, QUESTION_TYPES } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { courseAccess } from '@/lib/course';
import { isUuid } from '@/lib/utils';

async function editable(courseId: string) {
  const user = await requireUser();
  if (!isUuid(courseId)) throw new Error('BAD_REQUEST');
  const acc = await courseAccess(user, courseId);
  if (!acc.canEdit) throw new Error('FORBIDDEN');
  return user;
}

async function bankCourse(bankId: string) {
  const [b] = await db.select({ c: questionBanks.courseId }).from(questionBanks).where(eq(questionBanks.id, bankId));
  if (!b) throw new Error('NOT_FOUND');
  return b.c;
}

export async function createBankAction(courseId: string, title: string) {
  await editable(courseId);
  const [b] = await db.insert(questionBanks).values({ courseId, title: title.trim().slice(0, 200) || '—' }).returning();
  revalidatePath(`/studio/${courseId}/questions`);
  return b;
}

export async function renameBankAction(bankId: string, title: string) {
  const courseId = await bankCourse(bankId);
  await editable(courseId);
  await db.update(questionBanks).set({ title: title.trim().slice(0, 200) || '—' }).where(eq(questionBanks.id, bankId));
  revalidatePath(`/studio/${courseId}/questions`);
}

export async function deleteBankAction(bankId: string) {
  const courseId = await bankCourse(bankId);
  await editable(courseId);
  await db.delete(questionBanks).where(eq(questionBanks.id, bankId));
  revalidatePath(`/studio/${courseId}/questions`);
}

const QuestionInput = z.object({
  type: z.enum(QUESTION_TYPES),
  text: z.string().trim().min(1).max(4000),
  difficulty: z.number().int().min(1).max(3),
  options: z.array(z.object({ text: z.string().trim().min(1).max(2000), isCorrect: z.boolean(), matchText: z.string().max(2000).nullable() })).max(12),
  answers: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
});

export async function saveQuestionAction(bankId: string, questionId: string | null, input: z.input<typeof QuestionInput>) {
  const courseId = await bankCourse(bankId);
  await editable(courseId);
  const q = QuestionInput.parse(input);
  if (q.type !== 'short' && q.options.length < 2) return { error: 'noOptions' as const };
  if ((q.type === 'single' || q.type === 'multiple') && !q.options.some((o) => o.isCorrect)) return { error: 'noCorrect' as const };
  if (q.type === 'short' && !q.answers?.length) return { error: 'noAnswers' as const };
  const options = q.type === 'short' ? [] : q.type === 'ordering' || q.type === 'matching' ? q.options.map((o) => ({ ...o, isCorrect: true })) : q.options;
  await db.transaction(async (tx) => {
    let id = questionId;
    if (id && isUuid(id)) {
      const [ex] = await tx.select().from(questions).where(and(eq(questions.id, id), eq(questions.bankId, bankId)));
      if (!ex) throw new Error('NOT_FOUND');
      await tx.update(questions).set({ type: q.type, text: q.text, difficulty: q.difficulty, data: q.answers ? { answers: q.answers } : {} }).where(eq(questions.id, id));
      await tx.delete(questionOptions).where(eq(questionOptions.questionId, id));
    } else {
      const [row] = await tx.insert(questions).values({ bankId, type: q.type, text: q.text, difficulty: q.difficulty, data: q.answers ? { answers: q.answers } : {} }).returning();
      id = row.id;
    }
    if (options.length) await tx.insert(questionOptions).values(options.map((o, i) => ({ questionId: id!, text: o.text, isCorrect: o.isCorrect, matchText: o.matchText, position: i })));
  });
  revalidatePath(`/studio/${courseId}/questions`);
  return { ok: true as const };
}

export async function deleteQuestionAction(questionId: string) {
  const [q] = await db.select({ b: questions.bankId }).from(questions).where(eq(questions.id, questionId));
  if (!q) return;
  const courseId = await bankCourse(q.b);
  await editable(courseId);
  await db.delete(questions).where(eq(questions.id, questionId));
  revalidatePath(`/studio/${courseId}/questions`);
}
