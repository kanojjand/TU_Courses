import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { calendarWindows, exportBatches, gradeItems, offerings, type GradeComponent } from '@/db/schema';

const WINDOW_FOR: Record<GradeComponent, string> = { TK1: 'grading_rk1', RK1: 'grading_rk1', TK2: 'grading_rk2', RK2: 'grading_rk2', EXAM: 'grading_exam' };

/** Статус ведомостей по компонентам для набора потоков */
export async function sheetStatuses(offeringIds: string[]) {
  if (!offeringIds.length) return [];
  const [items, batches, offs] = await Promise.all([
    db.select({ o: gradeItems.offeringId, c: gradeItems.component }).from(gradeItems).where(inArray(gradeItems.offeringId, offeringIds)),
    db.select().from(exportBatches).where(inArray(exportBatches.offeringId, offeringIds)).orderBy(desc(exportBatches.createdAt)),
    db.select({ id: offerings.id, periodId: offerings.periodId }).from(offerings).where(inArray(offerings.id, offeringIds)),
  ]);
  const periodIds = [...new Set(offs.map((o) => o.periodId))];
  const wins = periodIds.length ? await db.select().from(calendarWindows).where(inArray(calendarWindows.periodId, periodIds)) : [];
  const out: { offeringId: string; component: GradeComponent; hasItems: boolean; batch: typeof exportBatches.$inferSelect | null; window: { startsAt: Date; endsAt: Date } | null }[] = [];
  for (const o of offs) {
    for (const c of ['TK1', 'RK1', 'TK2', 'RK2', 'EXAM'] as GradeComponent[]) {
      const batch = batches.find((b) => b.offeringId === o.id && b.component === c && b.comment !== 'correction') ?? null;
      const w = wins.find((x) => x.periodId === o.periodId && x.kind === WINDOW_FOR[c]);
      out.push({ offeringId: o.id, component: c, hasItems: items.some((i) => i.o === o.id && i.c === c), batch, window: w ? { startsAt: w.startsAt, endsAt: w.endsAt } : null });
    }
  }
  return out;
}

export async function latestBatch(offeringId: string, component: GradeComponent) {
  const [b] = await db
    .select()
    .from(exportBatches)
    .where(and(eq(exportBatches.offeringId, offeringId), eq(exportBatches.component, component)))
    .orderBy(desc(exportBatches.createdAt))
    .limit(1);
  return b ?? null;
}
