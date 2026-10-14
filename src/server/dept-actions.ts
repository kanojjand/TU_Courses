'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { courseAuthors, courses, disciplines, userRoles } from '@/db/schema';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { departmentScope, inScope, requireRole } from '@/lib/rbac';
import { isUuid } from '@/lib/utils';

/** Назначить автора на курс дисциплины; если курса нет — создаётся черновик */
export async function assignAuthorAction(disciplineId: string, language: 'kk' | 'ru' | 'en', userId: string) {
  const head = await requireRole('dept_head', 'academic_office', 'admin');
  if (!isUuid(disciplineId) || !isUuid(userId)) return { error: 'bad' as const };
  const [d] = await db.select().from(disciplines).where(eq(disciplines.id, disciplineId));
  if (!d) return { error: 'bad' as const };
  const scope = await departmentScope(head, 'dept_head');
  const office = head.roles.some((r) => r.role === 'academic_office' || r.role === 'admin');
  if (!office && !inScope(scope, d.departmentId)) return { error: 'forbidden' as const };
  let [c] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.disciplineId, disciplineId), eq(courses.language, language), eq(courses.isTemplate, false), ne(courses.status, 'archived')));
  if (!c) {
    [c] = await db.insert(courses).values({ disciplineId, language, title: language === 'kk' ? d.nameKk : language === 'en' ? d.nameEn : d.nameRu, ownerId: userId, status: 'draft' }).returning();
  }
  await db.insert(courseAuthors).values({ courseId: c.id, userId, assignedBy: head.id }).onConflictDoNothing();
  const hasRole = await db.select().from(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'author')));
  if (!hasRole.length)
    await db
      .insert(userRoles)
      .values({ userId, role: 'author', scopeType: d.departmentId ? 'department' : 'university', scopeId: d.departmentId, grantedBy: head.id })
      .onConflictDoNothing();
  await audit(head.id, 'course.assign_author', 'course', c.id, null, { userId });
  await notify([userId], 'authorAssigned', { course: c.title }, `/studio/${c.id}`);
  revalidatePath('/department/authors');
  return { ok: true as const, courseId: c.id };
}

export async function removeAuthorAction(courseId: string, userId: string) {
  const head = await requireRole('dept_head', 'academic_office', 'admin');
  await db.delete(courseAuthors).where(and(eq(courseAuthors.courseId, courseId), eq(courseAuthors.userId, userId)));
  await audit(head.id, 'course.remove_author', 'course', courseId, { userId }, null);
  revalidatePath('/department/authors');
  return { ok: true as const };
}
