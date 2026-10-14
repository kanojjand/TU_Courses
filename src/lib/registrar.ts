import 'server-only';
import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { disciplines, exportBatches, exportRows, gradeChangeRequests, gradeItems, offerings, syncIssues, syncRuns, users, type BatchStatus } from '@/db/schema';

export async function recentRuns(limit = 50) {
  return db
    .select({ run: syncRuns, by: { lastName: users.lastName, firstName: users.firstName, middleName: users.middleName } })
    .from(syncRuns)
    .leftJoin(users, eq(users.id, syncRuns.startedBy))
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);
}

export async function batchesByStatus(statuses: BatchStatus[]) {
  const rows = await db
    .select({ batch: exportBatches, offering: offerings, discipline: disciplines, teacher: { lastName: users.lastName, firstName: users.firstName, middleName: users.middleName } })
    .from(exportBatches)
    .innerJoin(offerings, eq(offerings.id, exportBatches.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .leftJoin(users, eq(users.id, offerings.teacherId))
    .where(inArray(exportBatches.status, statuses))
    .orderBy(desc(exportBatches.createdAt));
  const ids = rows.map((r) => r.batch.id);
  const counts = ids.length
    ? await db.select({ b: exportRows.batchId, n: count() }).from(exportRows).where(inArray(exportRows.batchId, ids)).groupBy(exportRows.batchId)
    : [];
  return rows.map((r) => ({ ...r, rows: counts.find((c) => c.b === r.batch.id)?.n ?? 0 }));
}

export async function pendingRequests(status: 'pending' | 'decided') {
  const requester = { lastName: users.lastName, firstName: users.firstName, middleName: users.middleName };
  const rows = await db
    .select({ req: gradeChangeRequests, item: gradeItems, offering: offerings, discipline: disciplines, requester })
    .from(gradeChangeRequests)
    .innerJoin(gradeItems, eq(gradeItems.id, gradeChangeRequests.gradeItemId))
    .innerJoin(offerings, eq(offerings.id, gradeItems.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(users, eq(users.id, gradeChangeRequests.requestedBy))
    .where(status === 'pending' ? eq(gradeChangeRequests.status, 'pending') : sql`${gradeChangeRequests.status} <> 'pending'`)
    .orderBy(desc(gradeChangeRequests.createdAt))
    .limit(300);
  const studentIds = [...new Set(rows.map((r) => r.req.studentId))];
  const studs = studentIds.length ? await db.select().from(users).where(inArray(users.id, studentIds)) : [];
  return rows.map((r) => ({ ...r, student: studs.find((s) => s.id === r.req.studentId)! }));
}

export async function runIssues(runId: string) {
  return db.select().from(syncIssues).where(eq(syncIssues.runId, runId)).orderBy(syncIssues.rowNo);
}

export async function registrarCounters() {
  const [[ready], [pending]] = await Promise.all([
    db.select({ n: count() }).from(exportBatches).where(eq(exportBatches.status, 'ready')),
    db.select({ n: count() }).from(gradeChangeRequests).where(eq(gradeChangeRequests.status, 'pending')),
  ]);
  return { ready: ready?.n ?? 0, pending: pending?.n ?? 0 };
}

