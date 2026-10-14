'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { exportBatches, students, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { decideRequest, setBatchStatus } from '@/lib/grades';
import { IMPORT_KINDS, type ImportKind } from '@/lib/platonus/formats';
import { applyImport, planImport, type ImportPlan, type RowPlan } from '@/lib/platonus/sync';
import { readTables } from '@/lib/platonus/tabular';
import { requireRole } from '@/lib/rbac';
import { generatePassword, isUuid } from '@/lib/utils';

const PREVIEW_LIMIT = 300;

async function readFile(form: FormData) {
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('NO_FILE');
  const tables = await readTables(file.name, Buffer.from(await file.arrayBuffer()));
  const table = tables.find((t) => t.rows.length) ?? tables[0] ?? { header: [], rows: [] };
  return { file, table };
}

export type PlanSummary = {
  fileIssues: ImportPlan['fileIssues'];
  counters: ImportPlan['counters'];
  rows: Omit<RowPlan, 'data' | 'existingId'>[];
};

function summarize(plan: ImportPlan): PlanSummary {
  const errors = plan.rows.filter((r) => r.action === 'error');
  const others = plan.rows.filter((r) => r.action !== 'error').slice(0, Math.max(0, PREVIEW_LIMIT - errors.length));
  return {
    fileIssues: plan.fileIssues,
    counters: plan.counters,
    rows: [...errors, ...others].sort((a, b) => a.rowNo - b.rowNo).map(({ rowNo, action, label, issues }) => ({ rowNo, action, label, issues })),
  };
}

/** Шаг «Проверка»: ничего не пишем, показываем, что произойдёт */
export async function planImportAction(kind: ImportKind, form: FormData): Promise<PlanSummary | { error: string }> {
  await requireRole('registrar', 'admin');
  if (!IMPORT_KINDS.includes(kind)) return { error: 'badKind' };
  try {
    const { table } = await readFile(form);
    return summarize(await planImport(kind, table.header, table.rows));
  } catch (e) {
    return { error: (e as Error).message === 'XLS_NOT_SUPPORTED' ? 'xls' : 'unreadable' };
  }
}

/** Шаг «Загрузить»: файл проверяется заново и применяется, запуск пишется в sync_runs */
export async function applyImportAction(kind: ImportKind, form: FormData, dropMissing = false) {
  const user = await requireRole('registrar', 'admin');
  if (!IMPORT_KINDS.includes(kind)) return { error: 'badKind' as const };
  const { file, table } = await readFile(form);
  const plan = await planImport(kind, table.header, table.rows);
  if (plan.fileIssues.length) return { error: 'fileIssues' as const };
  const res = await applyImport(plan, { fileName: file.name, actorId: user.id }, { dropMissing });
  await audit(user.id, `import.${kind}`, 'sync_run', res.runId, null, res.counters);
  revalidatePath('/registrar');
  return { ok: true as const, ...res };
}

export async function setBatchStatusAction(batchId: string, status: 'sent' | 'confirmed' | 'rejected', comment?: string) {
  const user = await requireRole('registrar', 'admin');
  if (!isUuid(batchId)) return { error: 'bad' as const };
  await setBatchStatus(batchId, status, user.id, comment);
  revalidatePath('/registrar/sheets');
  return { ok: true as const };
}

export async function markReadySentAction() {
  const user = await requireRole('registrar', 'admin');
  const ready = await db.select({ id: exportBatches.id }).from(exportBatches).where(eq(exportBatches.status, 'ready'));
  for (const b of ready) await setBatchStatus(b.id, 'sent', user.id);
  revalidatePath('/registrar/sheets');
  return { count: ready.length };
}

export async function decideRequestAction(requestId: string, approve: boolean, comment?: string) {
  const user = await requireRole('registrar', 'admin');
  if (!isUuid(requestId)) return { error: 'bad' as const };
  try {
    await decideRequest(requestId, approve, user.id, comment);
  } catch {
    return { error: 'notPending' as const };
  }
  revalidatePath('/registrar/requests');
  return { ok: true as const };
}

/**
 * Пароли группе: генерируются здесь и возвращаются один раз для печати.
 * В базе — только хэш.
 */
export async function issuePasswordsAction(groupId: string, onlyMissing: boolean) {
  const actor = await requireRole('registrar', 'admin');
  if (!isUuid(groupId)) return { error: 'bad' as const };
  const rows = await db
    .select({ id: users.id, login: users.login, lastName: users.lastName, firstName: users.firstName, middleName: users.middleName })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(and(eq(students.groupId, groupId), onlyMissing ? isNull(users.passwordHash) : undefined));
  const out: { login: string; name: string; password: string }[] = [];
  for (const r of rows) {
    const password = generatePassword(10);
    await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, r.id));
    out.push({ login: r.login, name: [r.lastName, r.firstName, r.middleName].filter(Boolean).join(' '), password });
  }
  await audit(actor.id, 'accounts.issue_passwords', 'study_group', groupId, null, { count: out.length, onlyMissing });
  return { ok: true as const, accounts: out.sort((a, b) => a.name.localeCompare(b.name, 'ru')) };
}


