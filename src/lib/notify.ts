import 'server-only';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { chunk } from './utils';

/**
 * Уведомления хранят тип и параметры, а не готовый текст:
 * каждый видит сообщение на своём языке интерфейса.
 */
export type NotifyType =
  | 'gradePosted'
  | 'submissionReceived'
  | 'submissionGraded'
  | 'deadlineSoon'
  | 'courseSubmitted'
  | 'courseApproved'
  | 'courseReturned'
  | 'requestCreated'
  | 'requestApproved'
  | 'requestRejected'
  | 'sheetReady'
  | 'sheetRejected'
  | 'videoReady'
  | 'videoFailed'
  | 'authorAssigned';

export async function notify(userIds: string[], type: NotifyType, params: Record<string, string | number> = {}, link?: string) {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const part of chunk(ids, 1000)) {
    if (part.length) await db.insert(notifications).values(part.map((userId) => ({ userId, type, params, link: link ?? null })));
  }
}
