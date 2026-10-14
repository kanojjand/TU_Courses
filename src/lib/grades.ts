import 'server-only';
import { and, asc, eq, inArray, lte, gte } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicPeriods,
  calendarWindows,
  enrollments,
  exportBatches,
  exportRows,
  externalIds,
  gradeChangeRequests,
  gradeItems,
  grades,
  offerings,
  students,
  studyGroups,
  users,
  disciplines,
  userRoles,
  type GradeComponent,
  type Role,
} from '@/db/schema';
import { audit } from './audit';
import { notify } from './notify';
import { schemeForOffering } from './progress';
import { admissionRating, componentScores } from './rules/rating';
import { applyLateRule, clampScore, teacherEditDecision, timingAt } from './rules/deadlines';
import { fullName } from './utils';

export const COMPONENT_ORDER: GradeComponent[] = ['TK1', 'RK1', 'TK2', 'RK2', 'EXAM'];

/* ───────────────────────── Элементы оценивания ───────────────────────── */

/**
 * Элементы по шаблону для нового потока: ТК1, РК1, ТК2, РК2, экзамен.
 * Окна берутся из академического календаря периода: жёсткое закрытие —
 * конец периода выставления оценок за РК или сессию (раздел 5.3, п. 1).
 */
export async function createDefaultItems(offeringId: string) {
  const [off] = await db.select().from(offerings).where(eq(offerings.id, offeringId));
  if (!off) throw new Error('OFFERING_NOT_FOUND');
  const [period] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, off.periodId));
  const wins = await db.select().from(calendarWindows).where(eq(calendarWindows.periodId, off.periodId));
  const w = (k: string) => wins.find((x) => x.kind === k);
  const start = period ? new Date(`${period.startsOn}T00:00:00+05:00`) : null;
  const end = period ? new Date(`${period.endsOn}T23:59:00+05:00`) : null;
  const rk1 = w('rk1');
  const rk2 = w('rk2');
  const session = w('session');
  const g1 = w('grading_rk1');
  const g2 = w('grading_rk2');
  const ge = w('grading_exam');
  const items = [
    { component: 'TK1' as const, title: 'ТК1', opensAt: start, dueAt: rk1?.startsAt ?? null, hardCloseAt: g1?.endsAt ?? rk1?.endsAt ?? null },
    { component: 'RK1' as const, title: 'РК1', opensAt: rk1?.startsAt ?? null, dueAt: rk1?.endsAt ?? null, hardCloseAt: g1?.endsAt ?? null },
    { component: 'TK2' as const, title: 'ТК2', opensAt: rk1?.endsAt ?? start, dueAt: rk2?.startsAt ?? null, hardCloseAt: g2?.endsAt ?? rk2?.endsAt ?? null },
    { component: 'RK2' as const, title: 'РК2', opensAt: rk2?.startsAt ?? null, dueAt: rk2?.endsAt ?? null, hardCloseAt: g2?.endsAt ?? null },
    { component: 'EXAM' as const, title: 'Экзамен', opensAt: session?.startsAt ?? null, dueAt: session?.endsAt ?? null, hardCloseAt: ge?.endsAt ?? end },
  ];
  const existing = await db.select({ c: gradeItems.component }).from(gradeItems).where(eq(gradeItems.offeringId, offeringId));
  const have = new Set(existing.map((e) => e.c));
  const toAdd = items.filter((i) => !have.has(i.component));
  if (toAdd.length) await db.insert(gradeItems).values(toAdd.map((i, k) => ({ ...i, offeringId, position: k * 10 })));
  return toAdd.length;
}

/** Окно элемента по умолчанию: жёсткое закрытие — из календаря */
export async function defaultHardClose(offeringId: string, component: GradeComponent) {
  const [off] = await db.select({ p: offerings.periodId }).from(offerings).where(eq(offerings.id, offeringId));
  if (!off) return null;
  const kind = component === 'EXAM' ? 'grading_exam' : component.endsWith('1') ? 'grading_rk1' : 'grading_rk2';
  const [w] = await db
    .select()
    .from(calendarWindows)
    .where(and(eq(calendarWindows.periodId, off.p), eq(calendarWindows.kind, kind)));
  return w?.endsAt ?? null;
}

/* ───────────────────────── Автооценка из теста или задания ───────────────────────── */

/**
 * Студент сдал тест или задание: балл попадает во все журналы его потоков,
 * где этот блок привязан к элементу оценивания. Учитываются окно и правило
 * поздней сдачи. После закрытия окна и после отправки ведомости оценка сама
 * не меняется — только через заявку.
 */
export async function writeAutoGrade(studentId: string, blockId: string, rawScore: number, at: Date = new Date(), mode: 'best' | 'replace' = 'best') {
  const items = await db
    .select({ item: gradeItems, offeringId: offerings.id })
    .from(gradeItems)
    .innerJoin(offerings, eq(offerings.id, gradeItems.offeringId))
    .innerJoin(enrollments, and(eq(enrollments.offeringId, offerings.id), eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')))
    .where(eq(gradeItems.blockId, blockId));
  const written: string[] = [];
  for (const { item, offeringId } of items) {
    const timing = timingAt(item, at);
    if (timing === 'not_open' || timing === 'closed') continue;
    const scheme = await schemeForOffering(offeringId);
    const late = timing === 'late';
    const score = applyLateRule(rawScore, late, scheme);
    const [existing] = await db
      .select()
      .from(grades)
      .where(and(eq(grades.gradeItemId, item.id), eq(grades.studentId, studentId)));
    if (existing && (existing.status === 'sent' || existing.status === 'confirmed')) continue;
    if (existing && mode === 'best' && existing.score >= score) continue;
    await db
      .insert(grades)
      .values({ studentId, gradeItemId: item.id, score, rawScore: clampScore(rawScore), isLate: late, status: 'draft' })
      .onConflictDoUpdate({
        target: [grades.studentId, grades.gradeItemId],
        set: { score, rawScore: clampScore(rawScore), isLate: late, updatedAt: new Date() },
      });
    written.push(item.id);
  }
  return written;
}

/* ───────────────────────── Ручная оценка преподавателя ───────────────────────── */

export type SetGradeResult = { status: 'saved' | 'request_created' | 'forbidden' | 'invalid'; score?: number; late?: boolean };

export async function teacherSetGrade(opts: {
  actorId: string;
  itemId: string;
  studentId: string;
  score: number | null;
  late?: boolean;
  reason?: string;
}): Promise<SetGradeResult> {
  const [row] = await db
    .select({ item: gradeItems, teacherId: offerings.teacherId, offeringId: offerings.id })
    .from(gradeItems)
    .innerJoin(offerings, eq(offerings.id, gradeItems.offeringId))
    .where(eq(gradeItems.id, opts.itemId));
  if (!row) return { status: 'invalid' };
  if (row.teacherId !== opts.actorId) return { status: 'forbidden' };
  const [enr] = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.offeringId, row.offeringId), eq(enrollments.studentId, opts.studentId)));
  if (!enr) return { status: 'invalid' };
  const [existing] = await db
    .select()
    .from(grades)
    .where(and(eq(grades.gradeItemId, opts.itemId), eq(grades.studentId, opts.studentId)));
  if (opts.score === null) {
    if (!existing) return { status: 'saved' };
    if (teacherEditDecision(row.item, existing) !== 'ok') return { status: 'forbidden' };
    await db.delete(grades).where(eq(grades.id, existing.id));
    await audit(opts.actorId, 'grade.delete', 'grade', existing.id, existing, null);
    return { status: 'saved' };
  }
  const raw = clampScore(opts.score);
  const decision = teacherEditDecision(row.item, existing ?? null);
  if (decision === 'needs_request') {
    if (!opts.reason?.trim()) return { status: 'invalid' };
    const [req] = await db
      .insert(gradeChangeRequests)
      .values({
        gradeItemId: opts.itemId,
        studentId: opts.studentId,
        gradeId: existing?.id ?? null,
        oldScore: existing?.score ?? null,
        newScore: raw,
        reason: opts.reason.trim(),
        requestedBy: opts.actorId,
      })
      .returning();
    await audit(opts.actorId, 'grade_request.create', 'grade_change_request', req.id, null, req);
    const registrars = await usersWithRole('registrar');
    await notify(registrars, 'requestCreated', {}, '/registrar/requests');
    return { status: 'request_created' };
  }
  // Ручная оценка: преподаватель ставит итог, пометку «поздно» решает сам
  const late = opts.late ?? existing?.isLate ?? false;
  const scheme = await schemeForOffering(row.offeringId);
  const score = applyLateRule(raw, late, scheme);
  const [saved] = await db
    .insert(grades)
    .values({ studentId: opts.studentId, gradeItemId: opts.itemId, score, rawScore: raw, isLate: late, status: 'draft', updatedBy: opts.actorId })
    .onConflictDoUpdate({
      target: [grades.studentId, grades.gradeItemId],
      set: { score, rawScore: raw, isLate: late, updatedBy: opts.actorId, updatedAt: new Date(), status: 'draft' },
    })
    .returning();
  await audit(opts.actorId, 'grade.set', 'grade', saved.id, existing ?? null, { score, rawScore: raw, isLate: late });
  if (!existing || existing.score !== score) await notify([opts.studentId], 'gradePosted', { item: row.item.title }, '/learn/grades');
  return { status: 'saved', score, late };
}

export async function usersWithRole(role: Role) {
  const rows = await db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, role));
  return rows.map((r) => r.id);
}

/* ───────────────────────── Журнал потока ───────────────────────── */

export async function offeringJournal(offeringId: string) {
  const items = await db.select().from(gradeItems).where(eq(gradeItems.offeringId, offeringId)).orderBy(asc(gradeItems.position), asc(gradeItems.dueAt));
  const studentRows = await db
    .select({ user: users, groupCode: studyGroups.code, ext: externalIds.externalId })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .leftJoin(students, eq(students.userId, users.id))
    .leftJoin(studyGroups, eq(studyGroups.id, students.groupId))
    .leftJoin(externalIds, and(eq(externalIds.lmsId, users.id), eq(externalIds.entityType, 'student'), eq(externalIds.system, 'platonus')))
    .where(and(eq(enrollments.offeringId, offeringId), eq(enrollments.status, 'active')))
    .orderBy(asc(users.lastName), asc(users.firstName));
  const itemIds = items.map((i) => i.id);
  const gradeRows = itemIds.length ? await db.select().from(grades).where(inArray(grades.gradeItemId, itemIds)) : [];
  const scheme = await schemeForOffering(offeringId);
  const byStudent = new Map<string, Map<string, typeof grades.$inferSelect>>();
  gradeRows.forEach((g) => {
    if (!byStudent.has(g.studentId)) byStudent.set(g.studentId, new Map());
    byStudent.get(g.studentId)!.set(g.gradeItemId, g);
  });
  const rows = studentRows.map(({ user, groupCode, ext }) => {
    const gmap = byStudent.get(user.id) ?? new Map();
    const scores = new Map<string, number>([...gmap.entries()].map(([k, g]) => [k, g.score]));
    const comps = componentScores(items, scores);
    const rating = admissionRating(comps, scheme);
    return { student: user, name: fullName(user), groupCode: groupCode ?? '', platonusId: ext ?? '', grades: gmap, comps, rating };
  });
  return { items, rows, scheme };
}

/* ───────────────────────── Ведомости (пакеты в Platonus) ───────────────────────── */

/**
 * Преподаватель подтверждает ведомость по компоненту: оценки становятся
 * «итог», создаётся пакет «готово к отправке» для регистратора.
 */
export async function confirmSheet(offeringId: string, component: GradeComponent, teacherId: string) {
  const journal = await offeringJournal(offeringId);
  const compItems = journal.items.filter((i) => i.component === component);
  if (compItems.length === 0) throw new Error('NO_ITEMS');
  const [existing] = await db
    .select()
    .from(exportBatches)
    .where(and(eq(exportBatches.offeringId, offeringId), eq(exportBatches.component, component), inArray(exportBatches.status, ['ready', 'sent', 'confirmed'])));
  if (existing) throw new Error('ALREADY_CONFIRMED');
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(exportBatches)
      .values({ offeringId, component, status: 'ready', teacherConfirmedBy: teacherId, teacherConfirmedAt: new Date() })
      .returning();
    const rows = journal.rows.map((r) => {
      const late = compItems.some((i) => r.grades.get(i.id)?.isLate);
      const approved = compItems.map((i) => r.grades.get(i.id)?.approvedBy).find(Boolean);
      return { batchId: batch.id, studentId: r.student.id, score: r.comps[component] ?? 0, isLate: late, approvedBy: approved ?? null };
    });
    if (rows.length) await tx.insert(exportRows).values(rows);
    const ids = compItems.map((i) => i.id);
    await tx.update(grades).set({ status: 'final' }).where(and(inArray(grades.gradeItemId, ids), eq(grades.status, 'draft')));
    await audit(teacherId, 'sheet.confirm', 'export_batch', batch.id, null, { component, rows: rows.length }, tx);
    return batch;
  });
}

export async function setBatchStatus(batchId: string, status: 'sent' | 'confirmed' | 'rejected', actorId: string, comment?: string) {
  const [batch] = await db.select().from(exportBatches).where(eq(exportBatches.id, batchId));
  if (!batch) throw new Error('NOT_FOUND');
  const items = await db
    .select({ id: gradeItems.id })
    .from(gradeItems)
    .where(and(eq(gradeItems.offeringId, batch.offeringId), eq(gradeItems.component, batch.component)));
  const ids = items.map((i) => i.id);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(exportBatches)
      .set({
        status,
        registrarBy: actorId,
        ...(status === 'sent' ? { sentAt: now } : {}),
        ...(status === 'confirmed' ? { confirmedAt: now } : {}),
        ...(comment ? { comment } : {}),
      })
      .where(eq(exportBatches.id, batchId));
    if (ids.length) {
      const gradeStatus = status === 'rejected' ? 'draft' : status;
      await tx.update(grades).set({ status: gradeStatus }).where(inArray(grades.gradeItemId, ids));
    }
    await audit(actorId, `sheet.${status}`, 'export_batch', batchId, { status: batch.status }, { status, comment }, tx);
  });
  if (status === 'rejected') {
    const [off] = await db.select({ t: offerings.teacherId }).from(offerings).where(eq(offerings.id, batch.offeringId));
    if (off?.t) await notify([off.t], 'sheetRejected', { component: batch.component }, `/teach/${batch.offeringId}/sheets`);
  }
}

/** Строки ведомости для выгрузки (формат раздела 5.2) */
export async function batchSheetRows(batchId: string) {
  const [batch] = await db
    .select({ b: exportBatches, o: offerings, d: disciplines })
    .from(exportBatches)
    .innerJoin(offerings, eq(offerings.id, exportBatches.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .where(eq(exportBatches.id, batchId));
  if (!batch) return null;
  const rows = await db
    .select({ r: exportRows, u: users, g: studyGroups.code, ext: externalIds.externalId })
    .from(exportRows)
    .innerJoin(users, eq(users.id, exportRows.studentId))
    .leftJoin(students, eq(students.userId, users.id))
    .leftJoin(studyGroups, eq(studyGroups.id, students.groupId))
    .leftJoin(externalIds, and(eq(externalIds.lmsId, users.id), eq(externalIds.entityType, 'student'), eq(externalIds.system, 'platonus')))
    .where(eq(exportRows.batchId, batchId))
    .orderBy(asc(users.lastName));
  return {
    batch: batch.b,
    offering: batch.o,
    discipline: batch.d,
    rows: rows.map((x) => ({
      platonusStudentId: x.ext ?? '',
      fullName: fullName(x.u),
      groupCode: x.g ?? '',
      disciplineCode: batch.d.code,
      stream: batch.o.stream,
      component: batch.b.component,
      score: x.r.score,
      late: x.r.isLate,
      approvedBy: x.r.approvedBy ?? '',
    })),
  };
}

/* ───────────────────────── Заявки на изменение оценки ───────────────────────── */

export async function decideRequest(requestId: string, approve: boolean, actorId: string, comment?: string) {
  const [req] = await db.select().from(gradeChangeRequests).where(eq(gradeChangeRequests.id, requestId));
  if (!req || req.status !== 'pending') throw new Error('NOT_PENDING');
  const [item] = await db.select().from(gradeItems).where(eq(gradeItems.id, req.gradeItemId));
  await db.transaction(async (tx) => {
    await tx
      .update(gradeChangeRequests)
      .set({ status: approve ? 'approved' : 'rejected', decidedBy: actorId, decidedAt: new Date(), decisionComment: comment ?? null })
      .where(eq(gradeChangeRequests.id, requestId));
    if (approve) {
      const [g] = await tx
        .insert(grades)
        .values({ studentId: req.studentId, gradeItemId: req.gradeItemId, score: req.newScore, rawScore: req.newScore, status: 'final', approvedBy: actorId, updatedBy: req.requestedBy })
        .onConflictDoUpdate({
          target: [grades.studentId, grades.gradeItemId],
          set: { score: req.newScore, rawScore: req.newScore, status: 'final', approvedBy: actorId, updatedAt: new Date() },
        })
        .returning();
      // Если ведомость по компоненту уже ушла — исправление попадает в новый пакет
      const [sent] = await tx
        .select()
        .from(exportBatches)
        .where(and(eq(exportBatches.offeringId, item.offeringId), eq(exportBatches.component, item.component), inArray(exportBatches.status, ['sent', 'confirmed'])));
      if (sent) {
        const [fix] = await tx
          .insert(exportBatches)
          .values({ offeringId: item.offeringId, component: item.component, status: 'ready', comment: 'correction', teacherConfirmedBy: req.requestedBy, teacherConfirmedAt: new Date() })
          .returning();
        const approver = await tx.select().from(users).where(eq(users.id, actorId));
        await tx.insert(exportRows).values({ batchId: fix.id, studentId: req.studentId, score: req.newScore, isLate: g.isLate, approvedBy: approver[0] ? fullName(approver[0]) : null });
      }
      await audit(actorId, 'grade_request.approve', 'grade', g.id, { score: req.oldScore }, { score: req.newScore }, tx);
    } else {
      await audit(actorId, 'grade_request.reject', 'grade_change_request', requestId, null, { comment }, tx);
    }
  });
  await notify([req.requestedBy], approve ? 'requestApproved' : 'requestRejected', { item: item?.title ?? '' }, `/teach/${item?.offeringId}`);
  if (approve) await notify([req.studentId], 'gradePosted', { item: item?.title ?? '' }, '/learn/grades');
}

/* ───────────────────────── Ближайшие окна ───────────────────────── */

export async function upcomingWindows(periodIds: string[], days = 21) {
  if (!periodIds.length) return [];
  const now = new Date();
  const until = new Date(Date.now() + days * 86400_000);
  return db
    .select()
    .from(calendarWindows)
    .where(and(inArray(calendarWindows.periodId, periodIds), gte(calendarWindows.endsAt, now), lte(calendarWindows.startsAt, until)))
    .orderBy(asc(calendarWindows.startsAt));
}
