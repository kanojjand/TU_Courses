import 'server-only';
import { prisma, dec } from '@/lib/prisma';
import { validateCourseHours, type HoursValidationResult, type WorkTypeCode } from '@/domain/hours';
import { getHoursTolerance, requiresMethodistReview, getBooleanSetting } from './settings';
import { SETTINGS } from '@/domain/constants';
import { AUDIT_ACTIONS, writeAudit } from './audit';

/**
 * Сервис курсов — F-T-01…F-T-15, критерии приёмки № 1, 2.
 */

/** Проверка соответствия объёма курса кредитам дисциплины (раздел 4.2) */
export async function checkCourseHours(courseId: string): Promise<HoursValidationResult> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: {
      disciplineId: true,
      discipline: { select: { credits: true, hourNorms: true } },
      modules: {
        select: {
          items: {
            select: { id: true, plannedAcademicHours: true, workType: true },
          },
        },
      },
    },
  });

  const items = course.modules.flatMap((m) =>
    m.items.map((i) => ({
      id: i.id,
      plannedAcademicHours: dec(i.plannedAcademicHours),
      workType: i.workType as WorkTypeCode,
    }))
  );

  const [tolerance, enforceNorms] = await Promise.all([
    getHoursTolerance(),
    getBooleanSetting(SETTINGS.ENFORCE_WORK_TYPE_NORMS),
  ]);

  return validateCourseHours(items, course.discipline.credits, {
    tolerance,
    enforceNorms,
    norms: course.discipline.hourNorms.map((n) => ({
      workType: n.workType as WorkTypeCode,
      sharePercent: dec(n.sharePercent),
      tolerance: dec(n.tolerance),
    })),
  });
}

/**
 * Отправка курса на согласование методисту (F-T-14).
 * Проверка часов выполняется до отправки — методисту не должен попадать
 * курс с заведомо неверным объёмом.
 */
export async function submitCourseForReview(params: {
  courseId: string;
  actorId: string;
  actorEmail: string;
}): Promise<{ ok: true } | { ok: false; validation: HoursValidationResult }> {
  const validation = await checkCourseHours(params.courseId);
  if (!validation.valid) return { ok: false, validation };

  await prisma.course.update({
    where: { id: params.courseId },
    data: { status: 'ON_REVIEW', submittedAt: new Date(), reviewComment: null },
  });

  // Уведомление методистам кафедры
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: params.courseId },
    select: {
      discipline: { select: { nameRu: true, departmentId: true } },
    },
  });

  const methodists = await prisma.user.findMany({
    where: {
      roles: { some: { role: { code: 'METHODIST' } } },
      teacherProfile: { departmentId: course.discipline.departmentId },
    },
    select: { id: true },
  });

  if (methodists.length > 0) {
    await prisma.notification.createMany({
      data: methodists.map((m) => ({
        userId: m.id,
        type: 'COURSE_REVIEW' as const,
        title: 'Курс поступил на согласование',
        body: course.discipline.nameRu,
        link: `/admin/courses/${params.courseId}/review`,
      })),
    });
  }

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: AUDIT_ACTIONS.COURSE_SUBMIT_REVIEW,
    entityType: 'Course',
    entityId: params.courseId,
    newValue: { status: 'ON_REVIEW', plannedHours: validation.plannedHours },
  });

  return { ok: true };
}

/** Решение методиста по курсу */
export async function reviewCourse(params: {
  courseId: string;
  approved: boolean;
  comment?: string;
  actorId: string;
  actorEmail: string;
}): Promise<void> {
  await prisma.course.update({
    where: { id: params.courseId },
    data: {
      status: params.approved ? 'APPROVED' : 'REJECTED',
      reviewedAt: new Date(),
      reviewedById: params.actorId,
      reviewComment: params.comment,
    },
  });

  const teachers = await prisma.courseTeacher.findMany({
    where: { courseId: params.courseId },
    select: { teacher: { select: { userId: true } } },
  });

  await prisma.notification.createMany({
    data: teachers.map((t) => ({
      userId: t.teacher.userId,
      type: 'COURSE_REVIEW' as const,
      title: params.approved ? 'Курс согласован' : 'Курс возвращён на доработку',
      body: params.comment ?? '',
      link: `/teach/courses/${params.courseId}`,
    })),
  });

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: params.approved ? AUDIT_ACTIONS.COURSE_APPROVE : AUDIT_ACTIONS.COURSE_REJECT,
    entityType: 'Course',
    entityId: params.courseId,
    newValue: { status: params.approved ? 'APPROVED' : 'REJECTED', comment: params.comment },
  });
}

/**
 * Публикация курса (F-T-14, критерий приёмки № 2).
 * Курс, не прошедший проверку по объёму часов, не публикуется.
 */
export async function publishCourse(params: {
  courseId: string;
  actorId: string;
  actorEmail: string;
  isAdmin?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string; validation?: HoursValidationResult }> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: params.courseId },
    select: { status: true, modules: { select: { id: true } } },
  });

  const validation = await checkCourseHours(params.courseId);
  if (!validation.valid) {
    return {
      ok: false,
      reason: validation.issues.map((i) => i.message).join(' '),
      validation,
    };
  }

  const needsReview = await requiresMethodistReview();
  if (needsReview && course.status !== 'APPROVED' && !params.isAdmin) {
    return {
      ok: false,
      reason: 'Курс должен быть согласован методистом кафедры до публикации.',
      validation,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id: params.courseId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    // Ведомости создаются вместе с публикацией курса
    for (const cp of ['RK1', 'RK2', 'EXAM'] as const) {
      await tx.gradeSheet.upsert({
        where: { courseId_controlPeriod: { courseId: params.courseId, controlPeriod: cp } },
        create: {
          courseId: params.courseId,
          controlPeriod: cp,
          number: `${params.courseId.slice(-6).toUpperCase()}-${cp}`,
        },
        update: {},
      });
    }
  });

  // Уведомление зачисленных студентов
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: params.courseId, cancelledAt: null },
    select: { student: { select: { userId: true } } },
  });

  if (enrollments.length > 0) {
    const c = await prisma.course.findUniqueOrThrow({
      where: { id: params.courseId },
      select: { discipline: { select: { nameRu: true } } },
    });
    await prisma.notification.createMany({
      data: enrollments.map((e) => ({
        userId: e.student.userId,
        type: 'NEW_MATERIAL' as const,
        title: 'Курс опубликован',
        body: c.discipline.nameRu,
        link: `/my/courses/${params.courseId}`,
      })),
    });
  }

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: AUDIT_ACTIONS.COURSE_PUBLISH,
    entityType: 'Course',
    entityId: params.courseId,
    oldValue: { status: course.status },
    newValue: { status: 'PUBLISHED', plannedHours: validation.plannedHours },
  });

  return { ok: true };
}

/**
 * Копирование курса прошлого периода (F-T-03).
 * Раздел 8.2 ТЗ: важнейшая функция для принятия платформы преподавателями.
 * Копируются модули, элементы, банк вопросов, тесты, задания и силлабус.
 * Не копируются: регистрации, оценки, активность.
 */
export async function copyCourseContent(params: {
  sourceCourseId: string;
  targetCourseId: string;
  includeQuestionBank?: boolean;
  actorId: string;
}): Promise<{ modules: number; items: number; questions: number }> {
  const source = await prisma.course.findUniqueOrThrow({
    where: { id: params.sourceCourseId },
    include: {
      syllabus: true,
      modules: {
        orderBy: { orderIndex: 'asc' },
        include: {
          items: {
            orderBy: { orderIndex: 'asc' },
            include: { quiz: { include: { questions: true } }, assignment: true, attachments: true },
          },
        },
      },
      questionBank: {
        include: {
          topics: true,
          questions: { include: { options: true } },
        },
      },
    },
  });

  let itemCount = 0;
  let questionCount = 0;

  await prisma.$transaction(
    async (tx) => {
      // Силлабус
      if (source.syllabus) {
        await tx.syllabus.upsert({
          where: { courseId: params.targetCourseId },
          create: {
            courseId: params.targetCourseId,
            goals: source.syllabus.goals,
            competencies: source.syllabus.competencies,
            thematicPlan: source.syllabus.thematicPlan ?? undefined,
            policy: source.syllabus.policy,
            gradingCriteria: source.syllabus.gradingCriteria,
            literature: source.syllabus.literature,
          },
          update: {},
        });
      }

      // Банк вопросов
      const questionIdMap = new Map<string, string>();
      if (params.includeQuestionBank !== false && source.questionBank) {
        const bank = await tx.questionBank.upsert({
          where: { courseId: params.targetCourseId },
          create: { courseId: params.targetCourseId },
          update: {},
        });

        const topicIdMap = new Map<string, string>();
        for (const topic of source.questionBank.topics) {
          const created = await tx.questionTopic.upsert({
            where: { bankId_name: { bankId: bank.id, name: topic.name } },
            create: { bankId: bank.id, name: topic.name },
            update: {},
          });
          topicIdMap.set(topic.id, created.id);
        }

        for (const q of source.questionBank.questions) {
          const created = await tx.question.create({
            data: {
              bankId: bank.id,
              topicId: q.topicId ? topicIdMap.get(q.topicId) : null,
              type: q.type,
              difficulty: q.difficulty,
              text: q.text,
              explanation: q.explanation,
              defaultPoints: q.defaultPoints,
              payload: q.payload ?? undefined,
              options: {
                create: q.options.map((o) => ({
                  text: o.text,
                  isCorrect: o.isCorrect,
                  orderIndex: o.orderIndex,
                  matchKey: o.matchKey,
                })),
              },
            },
          });
          questionIdMap.set(q.id, created.id);
          questionCount++;
        }
      }

      // Модули и элементы содержания
      for (const m of source.modules) {
        const newModule = await tx.module.create({
          data: {
            courseId: params.targetCourseId,
            title: m.title,
            titleKk: m.titleKk,
            titleRu: m.titleRu,
            titleEn: m.titleEn,
            description: m.description,
            orderIndex: m.orderIndex,
            weekNumber: m.weekNumber,
            isPublished: m.isPublished,
          },
        });

        for (const item of m.items) {
          const newItem = await tx.contentItem.create({
            data: {
              moduleId: newModule.id,
              type: item.type,
              title: item.title,
              description: item.description,
              orderIndex: item.orderIndex,
              plannedAcademicHours: item.plannedAcademicHours,
              workType: item.workType,
              contentHtml: item.contentHtml,
              externalUrl: item.externalUrl,
              videoProvider: item.videoProvider,
              videoId: item.videoId,
              videoDurationSec: item.videoDurationSec,
              videoThumbnail: item.videoThumbnail,
              completionThreshold: item.completionThreshold,
              isPublished: item.isPublished,
            },
          });
          itemCount++;

          // Файлы переиспользуются по тому же ключу в хранилище —
          // копия объекта не создаётся, экономится квота Supabase Storage
          for (const att of item.attachments) {
            await tx.attachment.create({
              data: {
                contentItemId: newItem.id,
                storageKey: `${att.storageKey}#copy-${newItem.id}`,
                bucket: att.bucket,
                fileName: att.fileName,
                mimeType: att.mimeType,
                sizeBytes: att.sizeBytes,
                checksum: att.checksum,
                pageCount: att.pageCount,
                uploadedById: params.actorId,
              },
            });
          }

          if (item.quiz) {
            const newQuiz = await tx.quiz.create({
              data: {
                contentItemId: newItem.id,
                timeLimitMin: item.quiz.timeLimitMin,
                maxAttempts: item.quiz.maxAttempts,
                gradingMethod: item.quiz.gradingMethod,
                passingScore: item.quiz.passingScore,
                shuffleQuestions: item.quiz.shuffleQuestions,
                shuffleOptions: item.quiz.shuffleOptions,
                showResultImmediately: item.quiz.showResultImmediately,
                showCorrectAnswers: item.quiz.showCorrectAnswers,
                randomSelection: item.quiz.randomSelection,
                randomCount: item.quiz.randomCount,
                randomTopicIds: item.quiz.randomTopicIds,
                randomDifficulty: item.quiz.randomDifficulty,
              },
            });
            for (const qq of item.quiz.questions) {
              const mapped = questionIdMap.get(qq.questionId);
              if (!mapped) continue;
              await tx.quizQuestion.create({
                data: {
                  quizId: newQuiz.id,
                  questionId: mapped,
                  points: qq.points,
                  orderIndex: qq.orderIndex,
                },
              });
            }
          }

          if (item.assignment) {
            await tx.assignment.create({
              data: {
                contentItemId: newItem.id,
                instructions: item.assignment.instructions,
                allowLate: item.assignment.allowLate,
                latePenaltyPerDay: item.assignment.latePenaltyPerDay,
                latePenaltyMax: item.assignment.latePenaltyMax,
                maxScore: item.assignment.maxScore,
                allowedExtensions: item.assignment.allowedExtensions,
                maxFileSizeMb: item.assignment.maxFileSizeMb,
                maxFiles: item.assignment.maxFiles,
              },
            });
          }
        }
      }
    },
    { timeout: 60_000 }
  );

  return { modules: source.modules.length, items: itemCount, questions: questionCount };
}

/** Пересчёт порядковых индексов после перетаскивания (F-T-03) */
export async function reorderModules(courseId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Временный сдвиг, чтобы не нарушить уникальность (courseId, orderIndex)
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.module.update({
        where: { id: orderedIds[i] },
        data: { orderIndex: -(i + 1) },
      });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.module.update({ where: { id: orderedIds[i] }, data: { orderIndex: i } });
    }
  });
}

export async function reorderItems(moduleId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.contentItem.update({
        where: { id: orderedIds[i] },
        data: { orderIndex: -(i + 1) },
      });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.contentItem.update({ where: { id: orderedIds[i] }, data: { orderIndex: i } });
    }
  });
}

/** Аналитика курса (F-T-13) */
export async function courseAnalytics(courseId: string) {
  const [enrollments, progress, items, attempts, noActivity] = await Promise.all([
    prisma.enrollment.count({ where: { courseId, cancelledAt: null } }),
    prisma.progress.findMany({
      where: { courseId },
      select: { percent: true, totalMinutes: true, earnedHours: true, studentId: true },
    }),
    prisma.contentItem.count({ where: { module: { courseId } } }),
    prisma.quizAttempt.findMany({
      where: { quiz: { contentItem: { module: { courseId } } }, status: 'GRADED' },
      select: { percent: true, quizId: true },
    }),
    prisma.enrollment.findMany({
      where: {
        courseId,
        cancelledAt: null,
        student: { progress: { none: { courseId, percent: { gt: 0 } } } },
      },
      select: {
        student: {
          select: {
            id: true,
            user: { select: { lastNameRu: true, firstNameRu: true, email: true } },
          },
        },
      },
    }),
  ]);

  const completed = progress.filter((p) => dec(p.percent) >= 100).length;
  const avgMinutes =
    progress.length > 0
      ? progress.reduce((s, p) => s + dec(p.totalMinutes), 0) / progress.length
      : 0;

  // Распределение баллов по десяткам
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}–${i * 10 + 9}`,
    count: 0,
  }));
  for (const a of attempts) {
    const p = dec(a.percent);
    const idx = Math.min(9, Math.floor(p / 10));
    buckets[idx].count++;
  }

  return {
    enrolled: enrollments,
    totalItems: items,
    completionRate: enrollments > 0 ? Math.round((completed / enrollments) * 100) : 0,
    avgMinutes: Math.round(avgMinutes),
    avgProgress:
      progress.length > 0
        ? Math.round(progress.reduce((s, p) => s + dec(p.percent), 0) / progress.length)
        : 0,
    scoreDistribution: buckets,
    studentsWithoutActivity: noActivity.map((e) => ({
      id: e.student.id,
      name: `${e.student.user.lastNameRu} ${e.student.user.firstNameRu}`,
      email: e.student.user.email,
    })),
  };
}
