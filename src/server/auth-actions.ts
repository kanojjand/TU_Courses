'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { users } from '@/db/schema';
import { checkCredentials, createSession, destroySession, getCurrentUser, hashPassword, requireUser, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { isLocale, LOCALE_COOKIE } from '@/i18n/config';

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;

const year = 60 * 60 * 24 * 365;

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const login = String(form.get('login') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '');
  if (!login || !password) return { error: 'invalid' };
  const res = await checkCredentials(login, password);
  if (!res.ok) return { error: res.reason };
  await createSession(res.userId);
  const store = await cookies();
  if (isLocale(res.locale) && !store.get(LOCALE_COOKIE)) store.set(LOCALE_COOKIE, res.locale, { path: '/', maxAge: year });
  await audit(res.userId, 'auth.login', 'user', res.userId);
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(user.id, 'auth.logout', 'user', user.id);
  redirect('/login');
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: year });
  const user = await getCurrentUser();
  if (user) await db.update(users).set({ locale }).where(eq(users.id, user.id));
}

export async function setAccessibleModeAction(on: boolean) {
  (await cookies()).set('tu_a11y', on ? '1' : '0', { path: '/', maxAge: year });
  const user = await getCurrentUser();
  if (user) await db.update(users).set({ accessibleMode: on }).where(eq(users.id, user.id));
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  const repeat = String(form.get('repeat') ?? '');
  if (next.length < 8) return { error: 'passwordTooShort' };
  if (next !== repeat) return { error: 'passwordsDiffer' };
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!(await verifyPassword(current, row?.hash ?? null))) return { error: 'wrongCurrent' };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, user.id));
  await audit(user.id, 'auth.password_changed', 'user', user.id);
  return { ok: true };
}

export async function skipPasswordChangeAction() {
  const user = await requireUser();
  await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
  redirect('/');
}
