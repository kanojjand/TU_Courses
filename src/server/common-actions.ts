'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireUser } from '@/lib/auth';

export async function markNotificationsRead() {
  const user = await requireUser();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
}
