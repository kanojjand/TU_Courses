'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';

/** Банк вопросов курса — F-T-08. */

const optionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  matchKey: z.string().optional().nullable(),
});

const questionSchema = z.object({
  courseId: z.string(),
  topicName: z.string().optional(),
  type: z.enum([
    'SINGLE_CHOICE',
    'MULTI_CHOICE',
    'MATCHING',
    'ORDERING',
    'SHORT_ANSWER',
    'TRUE_FALSE',
  ]),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  text: z.string().min(1, 'Укажите текст вопроса'),
  explanation: z.string().optional(),
  defaultPoints: z.coerce.number().min(0.01).max(100).default(1),
  options: z.array(optionSchema).default([]),
  /** SHORT_ANSWER — список допустимых ответов */
  answers: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional(),
});

export type QuestionInput = z.infer<typeof questionSchema>;

function validateByType(data: QuestionInput): string | null {
  switch (data.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      if (data.options.length < 2) return 'Требуется не менее двух вариантов ответа.';
      const correct = data.options.filter((o) => o.isCorrect).length;
      if (correct !== 1) return 'Должен быть указан ровно один верный вариант.';
      return null;
    }
    case 'MULTI_CHOICE': {
      if (data.options.length < 3) return 'Требуется не менее трёх вариантов ответа.';
      if (!data.options.some((o) => o.isCorrect)) return 'Укажите хотя бы один верный вариант.';
      return null;
    }
    case 'MATCHING': {
      if (data.options.length < 2) return 'Требуется не менее двух пар соответствия.';
      if (data.options.some((o) => !o.matchKey)) return 'Для каждой пары укажите соответствие.';
      return null;
    }
    case 'ORDERING': {
      if (data.options.length < 3) return 'Требуется не менее трёх элементов последовательности.';
      return null;
    }
    case 'SHORT_ANSWER': {
      if (!data.answers?.length) return 'Укажите хотя бы один допустимый ответ.';
      return null;
    }
  }
}

export async function createQuestion(input: QuestionInput) {
  const data = questionSchema.parse(input);
  await requireCourseTeacher(data.courseId);

  const error = validateByType(data);
  if (error) throw new Error(error);

  const bank = await prisma.questionBank.upsert({
    where: { courseId: data.courseId },
    create: { courseId: data.courseId },
    update: {},
  });

  const topicId = data.topicName
    ? (
        await prisma.questionTopic.upsert({
          where: { bankId_name: { bankId: bank.id, name: data.topicName } },
          create: { bankId: bank.id, name: data.topicName },
          update: {},
        })
      ).id
    : null;

  const question = await prisma.question.create({
    data: {
      bankId: bank.id,
      topicId,
      type: data.type,
      difficulty: data.difficulty,
      text: data.text,
      explanation: data.explanation,
      defaultPoints: data.defaultPoints,
      payload:
        data.type === 'SHORT_ANSWER'
          ? { answers: data.answers ?? [], caseSensitive: data.caseSensitive ?? false }
          : { partialCredit: true },
      options: {
        create: data.options.map((o, i) => ({
          text: o.text,
          isCorrect: o.isCorrect,
          orderIndex: i,
          // ORDERING: правильная позиция хранится в matchKey
          matchKey: data.type === 'ORDERING' ? String(i) : (o.matchKey ?? null),
        })),
      },
    },
  });

  revalidatePath(`/teach/courses/${data.courseId}/questions`);
  return question.id;
}

export async function deleteQuestion(questionId: string) {
  const q = await prisma.question.findUniqueOrThrow({
    where: { id: questionId },
    select: { bank: { select: { courseId: true } } },
  });
  await requireCourseTeacher(q.bank.courseId);
  await prisma.question.update({ where: { id: questionId }, data: { isActive: false } });
  revalidatePath(`/teach/courses/${q.bank.courseId}/questions`);
}
