import 'server-only';
import { db, type Tx } from '@/db';
import { activityEvents, auditLog } from '@/db/schema';

/** Журнал действий: кто, что, с каким объектом, было → стало */
export async function audit(
  actorId: string | null,
  action: string,
  entityType?: string,
  entityId?: string | null,
  before?: unknown,
  after?: unknown,
  tx?: Tx,
) {
  await (tx ?? db).insert(auditLog).values({
    actorId,
    action,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    before: before === undefined ? null : (before as object),
    after: after === undefined ? null : (after as object),
  });
}

/** Цифровой след обучающегося (только добавление) */
export async function track(userId: string, event: string, objectType?: string, objectId?: string) {
  try {
    await db.insert(activityEvents).values({ userId, event, objectType: objectType ?? null, objectId: objectId ?? null });
  } catch {
    // След не должен ломать основное действие
  }
}
