import 'server-only';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { exportBatches, gradeChangeRequests, notifications, offerings, submissions } from '@/db/schema';
import type { Role } from '@/db/schema';
import type { SessionUser } from './auth';

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

/** Счётчики в меню: «на проверку», «заявки», «к отправке» */
export async function navBadges(user: SessionUser, role: Role): Promise<Record<string, number>> {
  if (role === 'teacher') {
    const [r] = await db
      .select({ n: count() })
      .from(submissions)
      .innerJoin(offerings, eq(offerings.id, submissions.offeringId))
      .where(and(eq(offerings.teacherId, user.id), isNull(submissions.score)));
    return { toReview: r?.n ?? 0 };
  }
  if (role === 'registrar') {
    const [[req], [ready]] = await Promise.all([
      db.select({ n: count() }).from(gradeChangeRequests).where(eq(gradeChangeRequests.status, 'pending')),
      db.select({ n: count() }).from(exportBatches).where(eq(exportBatches.status, 'ready')),
    ]);
    return { requests: req?.n ?? 0, sheets: ready?.n ?? 0 };
  }
  return {};
}

