'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { sessions, staff, userRoles, users, ROLES, SCOPE_TYPES } from '@/db/schema';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { bunnyConfig } from '@/lib/bunny';
import { requireRole } from '@/lib/rbac';
import { getSetting, setSetting } from '@/lib/settings';
import { generatePassword, isUuid } from '@/lib/utils';

const admin = () => requireRole('admin');

const StaffSchema = z.object({
  login: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().min(1).max(100),
  middleName: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).optional(),
});

export async function createStaffAction(input: z.input<typeof StaffSchema>) {
  const actor = await admin();
  const parsed = StaffSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalid' as const };
  const d = parsed.data;
  const [exists] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.login}) = ${d.login}`);
  if (exists) return { error: 'loginTaken' as const };
  const password = generatePassword(10);
  const [u] = await db
    .insert(users)
    .values({ login: d.login, lastName: d.lastName, firstName: d.firstName, middleName: d.middleName || null, email: d.email || null, passwordHash: await hashPassword(password), mustChangePassword: true })
    .returning();
  await db.insert(staff).values({ userId: u.id });
  await audit(actor.id, 'user.create', 'user', u.id, null, { login: d.login });
  revalidatePath('/admin');
  return { ok: true as const, id: u.id, password };
}

export async function resetPasswordAction(userId: string) {
  const actor = await admin();
  if (!isUuid(userId)) return { error: 'bad' as const };
  const password = generatePassword(10);
  await db.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(actor.id, 'user.reset_password', 'user', userId);
  return { ok: true as const, password };
}

export async function setUserStatusAction(userId: string, status: 'active' | 'blocked') {
  const actor = await admin();
  if (!isUuid(userId) || userId === actor.id) return { error: 'bad' as const };
  await db.update(users).set({ status }).where(eq(users.id, userId));
  if (status === 'blocked') await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(actor.id, `user.${status === 'blocked' ? 'block' : 'unblock'}`, 'user', userId);
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function grantRoleAction(userId: string, input: { role: string; scopeType: string; scopeId: string | null }) {
  const actor = await admin();
  const d = z.object({ role: z.enum(ROLES), scopeType: z.enum(SCOPE_TYPES), scopeId: z.string().uuid().nullable() }).parse(input);
  if (!isUuid(userId)) return { error: 'bad' as const };
  if (d.scopeType !== 'university' && !d.scopeId) return { error: 'scope' as const };
  await db
    .insert(userRoles)
    .values({ userId, role: d.role, scopeType: d.scopeType, scopeId: d.scopeType === 'university' ? null : d.scopeId, grantedBy: actor.id })
    .onConflictDoNothing();
  await audit(actor.id, 'role.grant', 'user', userId, null, d);
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true as const };
}

export async function revokeRoleAction(roleRowId: string) {
  const actor = await admin();
  const [r] = await db.select().from(userRoles).where(eq(userRoles.id, roleRowId));
  if (!r) return { error: 'bad' as const };
  if (r.userId === actor.id && r.role === 'admin') return { error: 'self' as const };
  await db.delete(userRoles).where(and(eq(userRoles.id, roleRowId)));
  await audit(actor.id, 'role.revoke', 'user', r.userId, r, null);
  revalidatePath(`/admin/users/${r.userId}`);
  return { ok: true as const };
}

export async function saveBunnySettingsAction(input: { libraryId: string; apiKey: string; cdnHost: string; tokenKey: string }) {
  const actor = await admin();
  const prev = await getSetting<Record<string, string>>('bunny', {});
  const next = {
    libraryId: input.libraryId.trim(),
    cdnHost: input.cdnHost.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
    apiKey: input.apiKey.trim() || prev.apiKey || '',
    tokenKey: input.tokenKey.trim() || prev.tokenKey || '',
  };
  await setSetting('bunny', next);
  await audit(actor.id, 'settings.bunny', 'settings', 'bunny', { libraryId: prev.libraryId }, { libraryId: next.libraryId, cdnHost: next.cdnHost });
  revalidatePath('/admin/integrations');
  return { ok: true as const };
}

export async function testBunnyAction() {
  await admin();
  const cfg = await bunnyConfig();
  if (!cfg) return { ok: false as const, message: 'not configured' };
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${cfg.libraryId}/videos?page=1&itemsPerPage=1`, { headers: { AccessKey: cfg.apiKey, accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return { ok: false as const, message: `HTTP ${res.status}` };
    const data = (await res.json()) as { totalItems?: number };
    return { ok: true as const, count: data.totalItems ?? 0 };
  } catch (e) {
    return { ok: false as const, message: String((e as Error).message ?? e) };
  }
}
