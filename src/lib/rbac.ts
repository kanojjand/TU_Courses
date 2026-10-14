import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { departments, studyGroups, programs, type Role } from '@/db/schema';
import { ROLE_COOKIE, requireUser, type RoleAssignment, type SessionUser } from './auth';
import { ROLE_HOME, ROLE_ORDER } from './roles';

export function userHasRole(user: SessionUser, role: Role) {
  return user.roles.some((r) => r.role === role);
}

export function rolesOf(user: SessionUser): Role[] {
  const set = new Set(user.roles.map((r) => r.role));
  return ROLE_ORDER.filter((r) => set.has(r));
}

/** Роль для общих страниц (профиль, уведомления): последняя открытая или главная */
export async function currentRole(user: SessionUser): Promise<Role | null> {
  const fromCookie = (await cookies()).get(ROLE_COOKIE)?.value as Role | undefined;
  const mine = rolesOf(user);
  if (fromCookie && mine.includes(fromCookie)) return fromCookie;
  return mine[0] ?? null;
}

export async function homePath(user: SessionUser) {
  const role = await currentRole(user);
  return role ? ROLE_HOME[role] : '/profile';
}

/** Доступ к разделу роли. Без роли — на свою главную. */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.some((r) => userHasRole(user, r))) redirect(await homePath(user));
  return user;
}

export function assignments(user: SessionUser, role: Role): RoleAssignment[] {
  return user.roles.filter((r) => r.role === role);
}

export type Scope = { all: true } | { all: false; ids: string[] };

/**
 * Область роли, приведённая к кафедрам: «весь вуз» → all,
 * факультет → все его кафедры, кафедра → она сама.
 */
export async function departmentScope(user: SessionUser, role: Role): Promise<Scope> {
  const list = assignments(user, role);
  if (list.some((a) => a.scopeType === 'university')) return { all: true };
  const ids = new Set(list.filter((a) => a.scopeType === 'department' && a.scopeId).map((a) => a.scopeId!));
  const facultyIds = list.filter((a) => a.scopeType === 'faculty' && a.scopeId).map((a) => a.scopeId!);
  if (facultyIds.length) {
    const rows = await db.select({ id: departments.id }).from(departments).where(inArray(departments.facultyId, facultyIds));
    rows.forEach((r) => ids.add(r.id));
  }
  return { all: false, ids: [...ids] };
}

/** Область роли, приведённая к факультетам */
export async function facultyScope(user: SessionUser, role: Role): Promise<Scope> {
  const list = assignments(user, role);
  if (list.some((a) => a.scopeType === 'university')) return { all: true };
  const ids = new Set(list.filter((a) => a.scopeType === 'faculty' && a.scopeId).map((a) => a.scopeId!));
  const deptIds = list.filter((a) => a.scopeType === 'department' && a.scopeId).map((a) => a.scopeId!);
  if (deptIds.length) {
    const rows = await db.select({ f: departments.facultyId }).from(departments).where(inArray(departments.id, deptIds));
    rows.forEach((r) => ids.add(r.f));
  }
  return { all: false, ids: [...ids] };
}

/** Область роли, приведённая к группам (эдвайзер; декан и кафедра — через ОП) */
export async function groupScope(user: SessionUser, role: Role): Promise<Scope> {
  const list = assignments(user, role);
  if (list.some((a) => a.scopeType === 'university')) return { all: true };
  const ids = new Set(list.filter((a) => a.scopeType === 'group' && a.scopeId).map((a) => a.scopeId!));
  const programIds = list.filter((a) => a.scopeType === 'program' && a.scopeId).map((a) => a.scopeId!);
  const deptScope = await departmentScope(user, role);
  if (!deptScope.all && deptScope.ids.length) {
    const rows = await db.select({ id: programs.id }).from(programs).where(inArray(programs.departmentId, deptScope.ids));
    programIds.push(...rows.map((r) => r.id));
  }
  if (programIds.length) {
    const rows = await db.select({ id: studyGroups.id }).from(studyGroups).where(inArray(studyGroups.programId, programIds));
    rows.forEach((r) => ids.add(r.id));
  }
  return { all: false, ids: [...ids] };
}

export function inScope(scope: Scope, id: string | null | undefined) {
  return scope.all || (!!id && scope.ids.includes(id));
}

export async function departmentFaculty(departmentId: string) {
  const [d] = await db.select({ f: departments.facultyId }).from(departments).where(eq(departments.id, departmentId));
  return d?.f ?? null;
}
