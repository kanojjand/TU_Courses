'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma, dec } from '@/lib/prisma';
import { assertGradeEditable, requireCourseTeacher, requirePermission } from '@/server/guards';
import { closeGradeSheet, reopenGradeSheet, setGrade } from '@/server/grades';
import type { ControlPeriodCode } from '@/domain/grading';

/** Журнал и ведомости — F-T-12, F-A-05. */

const gradeItemSchema = z.object({
  courseId: z.string(),
  title: z.string().min(1).max(200),
  controlPeriod: z.enum(['RK1', 'RK2', 'EXAM']),
  maxScore: z.coerce.number().min(1).max(1000),
  weight: z.coerce.number().min(0).max(100),
  quizId: z.string().optional().nullable(),
  assignmentId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

export async function createGradeItem(input: z.infer<typeof gradeItemSchema>) {
  const data = gradeItemSchema.parse(input);
  await requireCourseTeacher(data.courseId);

  const last = await prisma.gradeItem.findFirst({
    where: { courseId: data.courseId, controlPeriod: data.controlPeriod },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  const item = await prisma.gradeItem.create({
    data: {
      courseId: data.courseId,
      title: data.title,
      controlPeriod: data.controlPeriod,
      maxScore: data.maxScore,
      weight: data.weight,
      quizId: data.quizId || null,
      assignmentId: data.assignmentId || null,
      isAutoGraded: Boolean(data.quizId || data.assignmentId),
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });

  revalidatePath(`/teach/courses/${data.courseId}/gradebook`);
  return item.id;
}

export async function deleteGradeItem(gradeItemId: string) {
  const item = await prisma.gradeItem.findUniqueOrThrow({
    where: { id: gradeItemId },
    select: { courseId: true },
  });
  await requireCourseTeacher(item.courseId);
  await prisma.gradeItem.delete({ where: { id: gradeItemId } });
  revalidatePath(`/teach/courses/${item.courseId}/gradebook`);
}

/**
 * F-T-12. Прямое редактирование ячейки журнала.
 * После закрытия ведомости правка возможна только офисом регистратора
 * с указанием основания (раздел 3, критерий приёмки № 13).
 */
export async function setGradeCell(input: {
  gradeItemId: string;
  studentId: string;
  score: number | null;
  reason?: string;
}) {
  const item = await prisma.gradeItem.findUniqueOrThrow({
    where: { id: input.gradeItemId },
    select: { courseId: true, controlPeriod: true, maxScore: true },
  });

  const { user } = await requireCourseTeacher(item.courseId);
  await assertGradeEditable(
    item.courseId,
    item.controlPeriod as ControlPeriodCode,
    user,
    input.reason
  );

  if (input.score === null) {
    await prisma.grade.deleteMany({
      where: { gradeItemId: input.gradeItemId, studentId: input.studentId },
    });
  } else {
    await setGrade({
      gradeItemId: input.gradeItemId,
      studentId: input.studentId,
      score: input.score,
      actorId: user.id,
      actorEmail: user.email,
      reason: input.reason,
    });
  }

  revalidatePath(`/teach/courses/${item.courseId}/gradebook`);
  return { maxScore: dec(item.maxScore) };
}

export async function closeSheet(courseId: string, controlPeriod: ControlPeriodCode) {
  const user = await requirePermission('gradesheet:close');
  await closeGradeSheet({ courseId, controlPeriod, actorId: user.id, actorEmail: user.email });
  revalidatePath(`/teach/courses/${courseId}/gradebook`);
  revalidatePath('/admin/gradesheets');
}

export async function reopenSheet(
  courseId: string,
  controlPeriod: ControlPeriodCode,
  reason: string
) {
  const user = await requirePermission('gradesheet:reopen');
  await reopenGradeSheet({
    courseId,
    controlPeriod,
    reason,
    actorId: user.id,
    actorEmail: user.email,
  });
  revalidatePath(`/teach/courses/${courseId}/gradebook`);
  revalidatePath('/admin/gradesheets');
}
