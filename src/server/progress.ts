import 'server-only';
import { prisma, dec } from '@/lib/prisma';
import { getActivityParams } from './settings';
import {
  capCountedMinutes,
  checkItemCompletion,
  creditForHeartbeat,
  isSessionStale,
  summarizeProgress,
} from '@/domain/activity';
import { round2 } from '@/domain/hours';

/**
 * Учёт активности, времени и прогресса — раздел 4.2, п. 2 ТЗ.
 * Критерий приёмки № 3.
 */

/** Открытие или продолжение сессии работы с элементом */
export async function openTimeSession(userId: string, contentItemId: string): Promise<string> {
  const params = await getActivityParams();

  const existing = await prisma.timeSession.findFirst({
    where: { userId, contentItemId, isClosed: false },
    orderBy: { lastHeartbeat: 'desc' },
  });

  if (existing && !isSessionStale(existing.lastHeartbeat, new Date(), params)) {
    return existing.id;
  }

  // Устаревшая сессия закрывается, открывается новая
  if (existing) {
    await prisma.timeSession.update({
      where: { id: existing.id },
      data: { isClosed: true, endedAt: existing.lastHeartbeat },
    });
  }

  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: contentItemId },
    select: { module: { select: { courseId: true } } },
  });

  const [session] = await prisma.$transaction([
    prisma.timeSession.create({ data: { userId, contentItemId } }),
    prisma.activityLog.create({
      data: {
        userId,
        contentItemId,
        courseId: item.module.courseId,
        type: 'VIEW_ITEM',
      },
    }),
  ]);

  return session.id;
}

/**
 * Сигнал активности (раз в 30 секунд при взаимодействии со страницей).
 * Возвращает актуальное состояние завершённости элемента.
 */
export async function heartbeat(params: {
  sessionId: string;
  userId: string;
  videoWatchedPercent?: number;
}): Promise<{ countedMinutes: number; completed: boolean; progressPercent: number }> {
  const activityParams = await getActivityParams();

  const session = await prisma.timeSession.findUniqueOrThrow({
    where: { id: params.sessionId },
    include: {
      contentItem: {
        select: {
          id: true,
          type: true,
          plannedAcademicHours: true,
          completionThreshold: true,
          module: { select: { courseId: true } },
          quiz: { select: { passingScore: true } },
        },
      },
    },
  });

  if (session.userId !== params.userId) {
    throw new Error('Сессия принадлежит другому пользователю.');
  }

  const now = new Date();
  const credited = creditForHeartbeat(
    now.getTime() - session.lastHeartbeat.getTime(),
    activityParams
  );

  const plannedHours = dec(session.contentItem.plannedAcademicHours);
  const countedMinutes = capCountedMinutes(
    dec(session.countedMinutes) + credited,
    plannedHours,
    activityParams
  );

  const videoPercent =
    params.videoWatchedPercent !== undefined
      ? Math.max(dec(session.videoWatchedPercent ?? 0), params.videoWatchedPercent)
      : dec(session.videoWatchedPercent ?? 0);

  await prisma.timeSession.update({
    where: { id: params.sessionId },
    data: {
      lastHeartbeat: now,
      countedMinutes,
      videoWatchedPercent: params.videoWatchedPercent !== undefined ? videoPercent : undefined,
    },
  });

  const student = await prisma.studentProfile.findUnique({
    where: { userId: params.userId },
    select: { id: true },
  });

  if (!student) {
    return { countedMinutes, completed: false, progressPercent: 0 };
  }

  const result = await evaluateItemCompletion({
    contentItemId: session.contentItem.id,
    studentId: student.id,
    userId: params.userId,
  });

  return {
    countedMinutes,
    completed: result.completed,
    progressPercent: result.progressPercent,
  };
}

/** Закрытие сессии при уходе со страницы */
export async function closeTimeSession(sessionId: string): Promise<void> {
  await prisma.timeSession.update({
    where: { id: sessionId },
    data: { isClosed: true, endedAt: new Date() },
  });
}

/**
 * Проверка и фиксация завершения элемента.
 * Идемпотентна: повторный вызов не создаёт дубликатов ItemCompletion.
 */
export async function evaluateItemCompletion(params: {
  contentItemId: string;
  studentId: string;
  userId: string;
}): Promise<{ completed: boolean; progressPercent: number; earnedHours: number }> {
  const activityParams = await getActivityParams();

  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: params.contentItemId },
    select: {
      id: true,
      type: true,
      plannedAcademicHours: true,
      completionThreshold: true,
      module: { select: { courseId: true } },
      quiz: {
        select: {
          id: true,
          passingScore: true,
          attempts: {
            where: { studentId: params.studentId, status: 'GRADED' },
            select: { percent: true },
          },
        },
      },
      assignment: {
        select: {
          submissions: {
            where: { studentId: params.studentId, status: { in: ['SUBMITTED', 'GRADED'] } },
            select: { id: true },
          },
        },
      },
    },
  });

  const sessions = await prisma.timeSession.findMany({
    where: { contentItemId: params.contentItemId, userId: params.userId },
    select: { countedMinutes: true, videoWatchedPercent: true },
  });

  const countedMinutes = capCountedMinutes(
    sessions.reduce((s, x) => s + dec(x.countedMinutes), 0),
    dec(item.plannedAcademicHours),
    activityParams
  );

  const videoWatched = sessions.reduce(
    (max, s) => Math.max(max, dec(s.videoWatchedPercent ?? 0)),
    0
  );

  const bestQuizPercent =
    item.quiz && item.quiz.attempts.length > 0
      ? Math.max(...item.quiz.attempts.map((a) => dec(a.percent)))
      : null;

  const result = checkItemCompletion({
    itemType: item.type,
    plannedAcademicHours: dec(item.plannedAcademicHours),
    completionThreshold: item.completionThreshold,
    countedMinutes,
    videoWatchedPercent: item.type === 'VIDEO' ? videoWatched : null,
    quizBestPercent: bestQuizPercent,
    quizPassingScore: item.quiz?.passingScore ?? null,
    assignmentSubmitted: (item.assignment?.submissions.length ?? 0) > 0,
    params: activityParams,
  });

  const existing = await prisma.itemCompletion.findUnique({
    where: {
      contentItemId_studentId: { contentItemId: params.contentItemId, studentId: params.studentId },
    },
  });

  if (result.completed && !existing) {
    await prisma.$transaction([
      prisma.itemCompletion.create({
        data: {
          contentItemId: params.contentItemId,
          studentId: params.studentId,
          earnedHours: result.earnedHours,
          method: result.method ?? 'TIME',
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: params.userId,
          contentItemId: params.contentItemId,
          courseId: item.module.courseId,
          type: 'COMPLETE_ITEM',
          meta: { method: result.method, earnedHours: result.earnedHours },
        },
      }),
    ]);
    await recalculateCourseProgress(item.module.courseId, params.studentId);
  } else if (!result.completed && existing) {
    // Условие завершения перестало выполняться — отметка снимается
    await prisma.itemCompletion.delete({ where: { id: existing.id } });
    await recalculateCourseProgress(item.module.courseId, params.studentId);
  } else {
    await recalculateCourseProgress(item.module.courseId, params.studentId);
  }

  return {
    completed: result.completed,
    progressPercent: result.progressPercent,
    earnedHours: result.earnedHours,
  };
}

/** Пересчёт агрегированного прогресса по курсу */
export async function recalculateCourseProgress(
  courseId: string,
  studentId: string
): Promise<void> {
  const [items, completions, sessions, course] = await Promise.all([
    prisma.contentItem.findMany({
      where: { module: { courseId }, isPublished: true },
      select: { id: true, plannedAcademicHours: true },
    }),
    prisma.itemCompletion.findMany({
      where: { studentId, contentItem: { module: { courseId } } },
      select: { contentItemId: true, earnedHours: true },
    }),
    prisma.timeSession.findMany({
      where: {
        contentItem: { module: { courseId } },
        user: { studentProfile: { id: studentId } },
      },
      select: { countedMinutes: true, lastHeartbeat: true },
    }),
    prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { discipline: { select: { credits: true } } },
    }),
  ]);

  const completedIds = new Set(completions.map((c) => c.contentItemId));
  const earnedMap = new Map(completions.map((c) => [c.contentItemId, dec(c.earnedHours)]));

  const summary = summarizeProgress(
    items.map((i) => ({
      plannedAcademicHours: dec(i.plannedAcademicHours),
      completed: completedIds.has(i.id),
      earnedHours: earnedMap.get(i.id) ?? 0,
    })),
    course.discipline.credits
  );

  const totalMinutes = round2(sessions.reduce((s, x) => s + dec(x.countedMinutes), 0));
  const lastActivityAt = sessions.reduce<Date | null>(
    (latest, s) => (!latest || s.lastHeartbeat > latest ? s.lastHeartbeat : latest),
    null
  );

  await prisma.progress.upsert({
    where: { courseId_studentId: { courseId, studentId } },
    create: {
      courseId,
      studentId,
      completedItems: summary.completedItems,
      totalItems: summary.totalItems,
      earnedHours: summary.earnedHours,
      totalHours: summary.totalHours,
      percent: summary.percent,
      totalMinutes,
      lastActivityAt,
    },
    update: {
      completedItems: summary.completedItems,
      totalItems: summary.totalItems,
      earnedHours: summary.earnedHours,
      totalHours: summary.totalHours,
      percent: summary.percent,
      totalMinutes,
      lastActivityAt,
    },
  });
}

/**
 * Закрытие «повисших» сессий — вызывается по расписанию.
 * Сессия, не получавшая сигнала дольше порога неактивности, закрывается
 * временем последнего сигнала: неактивное время не засчитывается.
 */
export async function closeStaleSessions(): Promise<number> {
  const params = await getActivityParams();
  const threshold = new Date(Date.now() - params.idleTimeoutMin * 60_000);

  const stale = await prisma.timeSession.findMany({
    where: { isClosed: false, lastHeartbeat: { lt: threshold } },
    select: { id: true, lastHeartbeat: true },
  });

  await prisma.$transaction(
    stale.map((s) =>
      prisma.timeSession.update({
        where: { id: s.id },
        data: { isClosed: true, endedAt: s.lastHeartbeat },
      })
    )
  );

  return stale.length;
}

/**
 * Сводка по участию за неделю — основа отчёта о посещаемости,
 * передаваемого в ИС МО через Platonus (п. 40 Типовых правил).
 */
export async function weeklyParticipation(courseId: string, weekStart: Date, weekEnd: Date) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId, cancelledAt: null },
    select: {
      student: {
        select: {
          id: true,
          userId: true,
          user: { select: { lastNameRu: true, firstNameRu: true } },
        },
      },
    },
  });

  const rows = await Promise.all(
    enrollments.map(async (e) => {
      const [sessions, completions] = await Promise.all([
        prisma.timeSession.aggregate({
          where: {
            userId: e.student.userId,
            contentItem: { module: { courseId } },
            startedAt: { gte: weekStart, lte: weekEnd },
          },
          _sum: { countedMinutes: true },
        }),
        prisma.itemCompletion.count({
          where: {
            studentId: e.student.id,
            contentItem: { module: { courseId } },
            completedAt: { gte: weekStart, lte: weekEnd },
          },
        }),
      ]);

      const minutes = dec(sessions._sum.countedMinutes);
      return {
        studentId: e.student.id,
        fullName: `${e.student.user.lastNameRu} ${e.student.user.firstNameRu}`,
        activeMinutes: minutes,
        itemsCompleted: completions,
        attended: minutes >= 15 || completions > 0,
      };
    })
  );

  return { weekStart, weekEnd, rows };
}
