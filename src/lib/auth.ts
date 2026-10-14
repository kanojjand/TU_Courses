import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '@/db';
import { sessions, userRoles, users, type Role, type ScopeType } from '@/db/schema';

export const SESSION_COOKIE = 'tu_session';
export const ROLE_COOKIE = 'tu_role';
const SESSION_DAYS = 30;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export type RoleAssignment = { role: Role; scopeType: ScopeType; scopeId: string | null };

export type SessionUser = {
  id: string;
  login: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  email: string | null;
  locale: 'kk' | 'ru' | 'en';
  accessibleMode: boolean;
  mustChangePassword: boolean;
  roles: RoleAssignment[];
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string | null) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ua = (await headers()).get('user-agent')?.slice(0, 300) ?? null;
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: ua });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  store.delete(SESSION_COOKIE);
  store.delete(ROLE_COOKIE);
}

/** Текущий пользователь (кешируется на время одного запроса) */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      login: users.login,
      lastName: users.lastName,
      firstName: users.firstName,
      middleName: users.middleName,
      email: users.email,
      locale: users.locale,
      accessibleMode: users.accessibleMode,
      mustChangePassword: users.mustChangePassword,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || u.status !== 'active') return null;
  const roles = await db
    .select({ role: userRoles.role, scopeType: userRoles.scopeType, scopeId: userRoles.scopeId })
    .from(userRoles)
    .where(eq(userRoles.userId, u.id));
  return { ...u, roles };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Проверка логина и пароля с блокировкой после серии неудачных попыток */
export async function checkCredentials(
  login: string,
  password: string,
): Promise<{ ok: true; userId: string; locale: string } | { ok: false; reason: 'invalid' | 'locked' | 'blocked' }> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.login, login.trim().toLowerCase()))
    .limit(1);
  if (!u) {
    // Сравнение «вхолостую», чтобы время ответа не выдавало существование логина
    await bcrypt.compare(password, '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Ff3S2f7F1J0kM1zPZlFqgQ3sV3Yxa');
    return { ok: false, reason: 'invalid' };
  }
  if (u.status !== 'active') return { ok: false, reason: 'blocked' };
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, reason: 'locked' };
  const valid = await verifyPassword(password, u.passwordHash);
  if (!valid) {
    const failed = u.failedLogins + 1;
    await db
      .update(users)
      .set({
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, u.id));
    return { ok: false, reason: failed >= MAX_FAILED ? 'locked' : 'invalid' };
  }
  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
  return { ok: true, userId: u.id, locale: u.locale };
}
