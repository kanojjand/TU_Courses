'use server';

import { revalidatePath } from 'next/cache';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher, requireEnrolledStudent } from '@/server/guards';
import { evaluateItemCompletion } from '@/server/progress';
import { setGrade } from '@/server/grades';
import { applyLatePenalty } from '@/domain/grading';
import { BUCKET_SUBMISSIONS, createUploadUrl, submissionKey } from '@/server/storage';

/**
 * Задания с загрузкой файлов — F-T-10, F-T-11, F-S-08.
 * Включены в этап 1 согласно замечанию раздела 10 ТЗ.
 */

/** Подписанная ссылка для прямой загрузки файла работы в хранилище */
export async function requestSubmissionUpload(input: {
  assignmentId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<{ signedUrl: string; token: string; storageKey: string }> {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: input.assignmentId },
    include: {
      contentItem: { select: { module: { select: { courseId: true } } } },
    },
  });

  const { studentId } = await requireEnrolledStudent(assignment.contentItem.module.courseId);

  const ext = input.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (assignment.allowedExtensions.length && !assignment.allowedExtensions.includes(ext)) {
    throw new Error(
      `Недопустимый формат файла. Разрешены: ${assignment.allowedExtensions.join(', ')}.`
    );
  }
  if (input.sizeBytes > assignment.maxFileSizeMb * 1024 * 1024) {
    throw new Error(`Размер файла превышает ${assignment.maxFileSizeMb} МБ.`);
  }

  const key = submissionKey(input.assignmentId, studentId, input.fileName);
  const { signedUrl, token } = await createUploadUrl(BUCKET_SUBMISSIONS, key);
  return { signedUrl, token, storageKey: key };
}

/** Регистрация загруженного файла в черновике работы */
export async function attachSubmissionFile(input: {
  assignmentId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: input.assignmentId },
    include: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });
  const { studentId } = await requireEnrolledStudent(assignment.contentItem.module.courseId);

  const submission = await prisma.submission.upsert({
    where: {
      assignmentId_studentId_attemptNo: {
        assignmentId: input.assignmentId,
        studentId,
        attemptNo: 1,
      },
    },
    create: { assignmentId: input.assignmentId, studentId, attemptNo: 1, status: 'DRAFT' },
    update: {},
  });

  const existing = await prisma.attachment.count({ where: { submissionId: submission.id } });
  if (existing >= assignment.maxFiles) {
    throw new Error(`Можно приложить не более ${assignment.maxFiles} файлов.`);
  }

  await prisma.attachment.create({
    data: {
      submissionId: submission.id,
      storageKey: input.storageKey,
      bucket: BUCKET_SUBMISSIONS,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
    },
  });

  revalidatePath(`/my/courses/${assignment.contentItem.module.courseId}`);
  return submission.id;
}

/** F-S-08. Сдача работы. Просрочка фиксируется для расчёта штрафа. */
export async function submitAssignment(assignmentId: string, comment?: string) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      contentItem: { select: { id: true, title: true, module: { select: { courseId: true } } } },
    },
  });

  const courseId = assignment.contentItem.module.courseId;
  const { studentId, user } = await requireEnrolledStudent(courseId);

  const now = new Date();
  const isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
  if (isLate && !assignment.allowLate) {
    throw new Error('Срок сдачи истёк, приём работ закрыт.');
  }

  const daysLate =
    isLate && assignment.dueAt
      ? Math.ceil((now.getTime() - assignment.dueAt.getTime()) / 86_400_000)
      : 0;

  const submission = await prisma.submission.upsert({
    where: {
      assignmentId_studentId_attemptNo: { assignmentId, studentId, attemptNo: 1 },
    },
    create: {
      assignmentId,
      studentId,
      attemptNo: 1,
      status: 'SUBMITTED',
      submittedAt: now,
      isLate,
      daysLate,
      comment,
    },
    update: {
      status: 'SUBMITTED',
      submittedAt: now,
      isLate,
      daysLate,
      comment,
      feedback: null,
      score: null,
      rawScore: null,
    },
  });

  const files = await prisma.attachment.count({ where: { submissionId: submission.id } });
  if (files === 0) throw new Error('Приложите хотя бы один файл.');

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      courseId,
      contentItemId: assignment.contentItem.id,
      type: 'SUBMIT_ASSIGNMENT',
      meta: { isLate, daysLate },
    },
  });

  // Уведомление преподавателям об ожидающей проверке работе
  const teachers = await prisma.courseTeacher.findMany({
    where: { courseId },
    select: { teacher: { select: { userId: true } } },
  });
  await prisma.notification.createMany({
    data: teachers.map((t) => ({
      userId: t.teacher.userId,
      type: 'SYSTEM' as const,
      title: 'Поступила работа на проверку',
      body: assignment.contentItem.title,
      link: `/teach/courses/${courseId}/submissions`,
    })),
  });

  await evaluateItemCompletion({
    contentItemId: assignment.contentItem.id,
    studentId,
    userId: user.id,
  });

  revalidatePath(`/my/courses/${courseId}`);
  return submission.id;
}

/** F-T-11. Проверка работы: балл, комментарий, возврат на доработку. */
export async function gradeSubmission(input: {
  submissionId: string;
  score: number;
  feedback?: string;
  returnForRevision?: boolean;
}) {
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: input.submissionId },
    include: {
      assignment: {
        include: {
          gradeItem: true,
          contentItem: { select: { module: { select: { courseId: true } } } },
        },
      },
      student: { select: { id: true, userId: true } },
    },
  });

  const courseId = submission.assignment.contentItem.module.courseId;
  const { user, isAssistant } = await requireCourseTeacher(courseId);
  void isAssistant; // тьютор вправе проверять работы, но не утверждать итоговые оценки

  if (input.returnForRevision) {
    await prisma.submission.update({
      where: { id: input.submissionId },
      data: {
        status: 'RETURNED',
        feedback: input.feedback,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        userId: submission.student.userId,
        type: 'SUBMISSION_RETURNED',
        title: 'Работа возвращена на доработку',
        body: input.feedback ?? '',
        link: `/my/courses/${courseId}`,
      },
    });

    revalidatePath(`/teach/courses/${courseId}/submissions`);
    return;
  }

  const maxScore = dec(submission.assignment.maxScore);
  if (input.score < 0 || input.score > maxScore) {
    throw new Error(`Балл должен быть в диапазоне 0…${maxScore}.`);
  }

  // Снижение балла за просрочку (F-T-10)
  const { score, penaltyPercent } = applyLatePenalty(
    input.score,
    submission.daysLate,
    dec(submission.assignment.latePenaltyPerDay),
    dec(submission.assignment.latePenaltyMax)
  );

  await prisma.submission.update({
    where: { id: input.submissionId },
    data: {
      status: 'GRADED',
      rawScore: input.score,
      score,
      feedback: input.feedback,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  if (submission.assignment.gradeItem) {
    await setGrade({
      gradeItemId: submission.assignment.gradeItem.id,
      studentId: submission.student.id,
      score:
        Math.round((score / maxScore) * dec(submission.assignment.gradeItem.maxScore) * 100) / 100,
      comment: penaltyPercent > 0 ? `Штраф за просрочку: −${penaltyPercent} %` : undefined,
      actorId: user.id,
      actorEmail: user.email,
    });
  }

  revalidatePath(`/teach/courses/${courseId}/submissions`);
}

/** F-T-10. Настройка задания преподавателем. */
export async function updateAssignment(input: {
  assignmentId: string;
  instructions?: string;
  dueAt?: string | null;
  allowLate?: boolean;
  latePenaltyPerDay?: number;
  latePenaltyMax?: number;
  maxScore?: number;
  allowedExtensions?: string[];
  maxFileSizeMb?: number;
  maxFiles?: number;
}) {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: input.assignmentId },
    select: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });
  await requireCourseTeacher(assignment.contentItem.module.courseId);

  const { assignmentId, dueAt, ...rest } = input;
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { ...rest, dueAt: dueAt ? new Date(dueAt) : dueAt === null ? null : undefined },
  });

  revalidatePath(`/teach/courses/${assignment.contentItem.module.courseId}/builder`);
}
