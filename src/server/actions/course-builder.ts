'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher, requirePermission } from '@/server/guards';
import {
  checkCourseHours,
  publishCourse as publishCourseService,
  submitCourseForReview,
  reorderItems as reorderItemsService,
  reorderModules as reorderModulesService,
  copyCourseContent,
} from '@/server/courses';
import { parseVideoUrl, slugify } from '@/lib/utils';
import type { HoursValidationResult } from '@/domain/hours';

/**
 * Серверные действия конструктора курса — F-T-03, F-T-05…F-T-07, F-T-14.
 */

const moduleSchema = z.object({
  courseId: z.string(),
  title: z.string().min(1, 'Укажите заголовок модуля').max(300),
  description: z.string().max(2000).optional(),
  weekNumber: z.coerce.number().int().min(1).max(52).optional().nullable(),
});

export async function createModule(input: z.infer<typeof moduleSchema>) {
  const data = moduleSchema.parse(input);
  await requireCourseTeacher(data.courseId);

  const last = await prisma.module.findFirst({
    where: { courseId: data.courseId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  const created = await prisma.module.create({
    data: {
      courseId: data.courseId,
      title: data.title,
      description: data.description,
      weekNumber: data.weekNumber ?? null,
      orderIndex: (last?.orderIndex ?? -1) + 1,
    },
  });

  revalidatePath(`/teach/courses/${data.courseId}/builder`);
  return created.id;
}

export async function updateModule(input: {
  moduleId: string;
  title?: string;
  description?: string;
  weekNumber?: number | null;
  isPublished?: boolean;
}) {
  const parent = await prisma.module.findUniqueOrThrow({
    where: { id: input.moduleId },
    select: { courseId: true },
  });
  await requireCourseTeacher(parent.courseId);

  await prisma.module.update({
    where: { id: input.moduleId },
    data: {
      title: input.title,
      description: input.description,
      weekNumber: input.weekNumber,
      isPublished: input.isPublished,
    },
  });

  revalidatePath(`/teach/courses/${parent.courseId}/builder`);
}

export async function deleteModule(moduleId: string) {
  const parent = await prisma.module.findUniqueOrThrow({
    where: { id: moduleId },
    select: { courseId: true },
  });
  await requireCourseTeacher(parent.courseId);
  await prisma.module.delete({ where: { id: moduleId } });
  revalidatePath(`/teach/courses/${parent.courseId}/builder`);
}

const itemSchema = z.object({
  moduleId: z.string(),
  type: z.enum(['TEXT', 'FILE', 'VIDEO', 'QUIZ', 'ASSIGNMENT', 'LINK']),
  title: z.string().min(1, 'Укажите название элемента').max(300),
  description: z.string().max(2000).optional(),
  // F-T-07: плановая трудоёмкость обязательна для каждого элемента
  plannedAcademicHours: z.coerce.number().min(0).max(999),
  workType: z.enum(['LECTURE', 'PRACTICE', 'LAB', 'SROP', 'SRO']),
  contentHtml: z.string().optional(),
  externalUrl: z.string().url().optional().or(z.literal('')),
  completionThreshold: z.coerce.number().int().min(1).max(100).default(80),
});

export async function createContentItem(input: z.infer<typeof itemSchema>) {
  const data = itemSchema.parse(input);

  const parent = await prisma.module.findUniqueOrThrow({
    where: { id: data.moduleId },
    select: { courseId: true },
  });
  await requireCourseTeacher(parent.courseId);

  const last = await prisma.contentItem.findFirst({
    where: { moduleId: data.moduleId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  });

  // F-T-06: извлечение идентификатора видео из ссылки
  const video = data.type === 'VIDEO' && data.externalUrl ? parseVideoUrl(data.externalUrl) : null;

  const item = await prisma.contentItem.create({
    data: {
      moduleId: data.moduleId,
      type: data.type,
      title: data.title,
      description: data.description,
      orderIndex: (last?.orderIndex ?? -1) + 1,
      plannedAcademicHours: data.plannedAcademicHours,
      workType: data.workType,
      contentHtml: data.contentHtml,
      externalUrl: data.externalUrl || null,
      videoProvider: video?.provider ?? null,
      videoId: video?.id ?? null,
      completionThreshold: data.completionThreshold,
    },
  });

  // Тест и задание создаются вместе с элементом
  if (data.type === 'QUIZ') {
    await prisma.quiz.create({ data: { contentItemId: item.id } });
    await prisma.questionBank.upsert({
      where: { courseId: parent.courseId },
      create: { courseId: parent.courseId },
      update: {},
    });
  }
  if (data.type === 'ASSIGNMENT') {
    await prisma.assignment.create({
      data: {
        contentItemId: item.id,
        allowedExtensions: ['pdf', 'docx', 'doc', 'pptx', 'xlsx', 'zip', 'png', 'jpg'],
      },
    });
  }

  revalidatePath(`/teach/courses/${parent.courseId}/builder`);
  return item.id;
}

export async function updateContentItem(input: {
  itemId: string;
  title?: string;
  description?: string;
  plannedAcademicHours?: number;
  workType?: 'LECTURE' | 'PRACTICE' | 'LAB' | 'SROP' | 'SRO';
  contentHtml?: string;
  externalUrl?: string;
  completionThreshold?: number;
  isPublished?: boolean;
}) {
  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: input.itemId },
    select: { type: true, module: { select: { courseId: true } } },
  });
  await requireCourseTeacher(item.module.courseId);

  const video =
    item.type === 'VIDEO' && input.externalUrl ? parseVideoUrl(input.externalUrl) : null;

  await prisma.contentItem.update({
    where: { id: input.itemId },
    data: {
      title: input.title,
      description: input.description,
      plannedAcademicHours: input.plannedAcademicHours,
      workType: input.workType,
      contentHtml: input.contentHtml,
      externalUrl: input.externalUrl,
      completionThreshold: input.completionThreshold,
      isPublished: input.isPublished,
      ...(video ? { videoProvider: video.provider, videoId: video.id } : {}),
    },
  });

  revalidatePath(`/teach/courses/${item.module.courseId}/builder`);
}

export async function deleteContentItem(itemId: string) {
  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { module: { select: { courseId: true } } },
  });
  await requireCourseTeacher(item.module.courseId);
  await prisma.contentItem.delete({ where: { id: itemId } });
  revalidatePath(`/teach/courses/${item.module.courseId}/builder`);
}

/** F-T-03: изменение порядка перетаскиванием */
export async function reorderModules(courseId: string, orderedIds: string[]) {
  await requireCourseTeacher(courseId);
  await reorderModulesService(courseId, orderedIds);
  revalidatePath(`/teach/courses/${courseId}/builder`);
}

export async function reorderItems(moduleId: string, orderedIds: string[]) {
  const parent = await prisma.module.findUniqueOrThrow({
    where: { id: moduleId },
    select: { courseId: true },
  });
  await requireCourseTeacher(parent.courseId);
  await reorderItemsService(moduleId, orderedIds);
  revalidatePath(`/teach/courses/${parent.courseId}/builder`);
}

/** Проверка объёма часов — вызывается индикатором конструктора (F-T-07) */
export async function validateHours(courseId: string): Promise<HoursValidationResult> {
  await requireCourseTeacher(courseId);
  return checkCourseHours(courseId);
}

/** F-T-14. Отправка на согласование методисту. */
export async function submitForReview(courseId: string) {
  const { user, isAssistant } = await requireCourseTeacher(courseId);
  if (isAssistant) throw new Error('Тьютор не может отправлять курс на согласование.');

  const result = await submitCourseForReview({
    courseId,
    actorId: user.id,
    actorEmail: user.email,
  });
  revalidatePath(`/teach/courses/${courseId}`);
  return result;
}

/** F-T-14. Публикация курса после одобрения. Критерий приёмки № 2. */
export async function publishCourse(courseId: string) {
  const { user, isAssistant } = await requireCourseTeacher(courseId);
  // Тьютор не имеет права публикации курса (раздел 3)
  if (isAssistant) throw new Error('Тьютор не имеет права публикации курса.');

  const result = await publishCourseService({
    courseId,
    actorId: user.id,
    actorEmail: user.email,
    isAdmin: user.roles.includes('ADMIN'),
  });

  revalidatePath(`/teach/courses/${courseId}`);
  revalidatePath('/courses');
  return result;
}

/** Управление отображением курса в публичном каталоге (F-P-04) */
export async function setCoursePublic(courseId: string, isPublic: boolean) {
  await requireCourseTeacher(courseId);
  await prisma.course.update({ where: { id: courseId }, data: { isPublic } });
  revalidatePath('/courses');
  revalidatePath(`/teach/courses/${courseId}`);
}

/** F-T-03. Копирование курса прошлого периода. */
export async function copyFromCourse(sourceCourseId: string, targetCourseId: string) {
  const { user } = await requireCourseTeacher(targetCourseId);
  await requireCourseTeacher(sourceCourseId);
  const result = await copyCourseContent({
    sourceCourseId,
    targetCourseId,
    actorId: user.id,
  });
  revalidatePath(`/teach/courses/${targetCourseId}/builder`);
  return result;
}

/** F-T-02. Силлабус по утверждённому шаблону. */
export async function saveSyllabus(input: {
  courseId: string;
  goals?: string;
  competencies?: string;
  policy?: string;
  gradingCriteria?: string;
  literature?: string;
  officeHours?: string;
  contactInfo?: string;
}) {
  await requireCourseTeacher(input.courseId);
  const { courseId, ...rest } = input;
  await prisma.syllabus.upsert({
    where: { courseId },
    create: { courseId, ...rest },
    update: rest,
  });
  revalidatePath(`/teach/courses/${courseId}/syllabus`);
}

/** F-T-15. Объявление по курсу с уведомлением зачисленных студентов. */
export async function createAnnouncement(input: {
  courseId: string;
  title: string;
  body: string;
  isPinned?: boolean;
}) {
  const { user } = await requireCourseTeacher(input.courseId);

  const announcement = await prisma.announcement.create({
    data: {
      courseId: input.courseId,
      authorId: user.id,
      title: input.title,
      body: input.body,
      isPinned: input.isPinned ?? false,
    },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: input.courseId, cancelledAt: null },
    select: { student: { select: { userId: true } } },
  });

  if (enrollments.length > 0) {
    await prisma.notification.createMany({
      data: enrollments.map((e) => ({
        userId: e.student.userId,
        type: 'ANNOUNCEMENT' as const,
        title: input.title,
        body: input.body.slice(0, 200),
        link: `/my/courses/${input.courseId}`,
      })),
    });
  }

  revalidatePath(`/teach/courses/${input.courseId}`);
  return announcement.id;
}

// ── Создание собственного курса преподавателем (F-T-01) ─────────────────────

const newCourseSchema = z.object({
  disciplineId: z.string().trim().min(1, 'Выберите дисциплину.'),
  periodId: z.string().trim().min(1, 'Выберите академический период.'),
  streamName: z.string().trim().max(50).optional(),
});

/**
 * Преподаватель заводит реализацию дисциплины сам, не дожидаясь офиса
 * Регистратора.
 *
 * Контроль при этом не теряется: курс создаётся черновиком, публикация
 * по-прежнему требует согласования методистом, а запись обучающихся идёт
 * через ИУП и офис Регистратора. Самостоятельным остаётся только наполнение.
 *
 * На дисциплину в периоде заводится один курс. Второй нужен лишь тогда,
 * когда дисциплину ведут параллельными потоками, — для этого указывается
 * название потока.
 */
export async function createOwnCourse(
  input: z.input<typeof newCourseSchema>
): Promise<{ ok: true; data: { id: string; existed: boolean } } | { ok: false; error: string }> {
  const user = await requirePermission('course:create');
  if (!user.teacherProfileId) {
    return { ok: false, error: 'У учётной записи нет профиля преподавателя.' };
  }

  const parsed = newCourseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Проверьте поля.' };
  }
  const { disciplineId, periodId } = parsed.data;
  const streamName = parsed.data.streamName?.trim() || null;

  const discipline = await prisma.discipline.findUnique({
    where: { id: disciplineId },
    select: { code: true, nameRu: true, isActive: true },
  });
  if (!discipline) return { ok: false, error: 'Дисциплина не найдена.' };
  if (!discipline.isActive) {
    return { ok: false, error: 'Дисциплина выведена из справочника.' };
  }

  const period = await prisma.academicPeriod.findUnique({
    where: { id: periodId },
    select: { name: true, academicYear: { select: { name: true } } },
  });
  if (!period) return { ok: false, error: 'Академический период не найден.' };

  // Составной уникальный ключ курса включает streamName, а в PostgreSQL два
  // NULL считаются различными — без явной проверки на дисциплину без потока
  // завелось бы сколько угодно курсов
  const existing = await prisma.course.findFirst({
    where: { disciplineId, periodId, streamName },
    select: {
      id: true,
      teachers: { where: { teacherId: user.teacherProfileId }, select: { id: true } },
    },
  });
  if (existing) {
    if (existing.teachers.length > 0) {
      return { ok: true, data: { id: existing.id, existed: true } };
    }
    return {
      ok: false,
      error:
        `«${discipline.nameRu}» в периоде «${period.name}» уже ведёт другой преподаватель. ` +
        'Если дисциплина идёт параллельными потоками, укажите название потока.',
    };
  }

  const slug = slugify(
    `${discipline.code} ${discipline.nameRu} ${period.academicYear.name} ${period.name} ${streamName ?? ''}`
  );

  const course = await prisma.course.create({
    data: {
      disciplineId,
      periodId,
      streamName,
      slug: `${slug}-${Date.now().toString(36)}`,
      teachers: { create: { teacherId: user.teacherProfileId, isLead: true } },
      questionBank: { create: {} },
    },
    select: { id: true },
  });

  revalidatePath('/[locale]/teach', 'page');
  return { ok: true, data: { id: course.id, existed: false } };
}
