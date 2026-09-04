import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * F-S-10. Уведомления о приближающихся сроках сдачи.
 *
 * Уведомляются только те обучающиеся, кто ещё не сдал работу.
 * Горизонт — 48 часов.
 */
export async function notifyUpcomingDeadlines(hoursAhead = 48) {
  const from = new Date();
  const to = new Date(Date.now() + hoursAhead * 3600_000);

  const assignments = await prisma.assignment.findMany({
    where: { dueAt: { gte: from, lte: to } },
    include: {
      contentItem: {
        select: { title: true, module: { select: { courseId: true } } },
      },
    },
  });

  let sent = 0;

  for (const a of assignments) {
    const pending = await prisma.enrollment.findMany({
      where: {
        courseId: a.contentItem.module.courseId,
        cancelledAt: null,
        student: {
          submissions: {
            none: { assignmentId: a.id, status: { in: ['SUBMITTED', 'GRADED'] } },
          },
        },
      },
      select: { student: { select: { userId: true } } },
    });

    if (pending.length === 0) continue;

    await prisma.notification.createMany({
      data: pending.map((e) => ({
        userId: e.student.userId,
        type: 'DEADLINE_SOON' as const,
        title: `Приближается срок сдачи: ${a.contentItem.title}`,
        body: a.dueAt ? `Срок: ${a.dueAt.toLocaleString('ru-RU')}` : '',
        link: `/my/courses/${a.contentItem.module.courseId}`,
      })),
    });

    sent += pending.length;
  }

  return { assignments: assignments.length, notifications: sent };
}
