'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { academicPeriods, academicYears, calendarWindows, gradeSchemes, STUDY_FORMS, WINDOW_KINDS } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/rbac';

const office = () => requireRole('academic_office', 'admin');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function addYearAction(input: { title: string; startsOn: string; endsOn: string; isCurrent: boolean }) {
  const user = await office();
  const d = z.object({ title: z.string().trim().min(4).max(40), startsOn: date, endsOn: date, isCurrent: z.boolean() }).parse(input);
  if (d.isCurrent) await db.update(academicYears).set({ isCurrent: false });
  const [y] = await db.insert(academicYears).values(d).returning();
  await audit(user.id, 'calendar.add_year', 'academic_year', y.id, null, d);
  revalidatePath('/academic/calendar');
  return { ok: true as const };
}

export async function addPeriodAction(input: { yearId: string; number: number; kind: 'semester' | 'extra'; startsOn: string; endsOn: string; isCurrent: boolean }) {
  const user = await office();
  const d = z
    .object({ yearId: z.string().uuid(), number: z.number().int().min(1).max(4), kind: z.enum(['semester', 'extra']), startsOn: date, endsOn: date, isCurrent: z.boolean() })
    .parse(input);
  const [y] = await db.select().from(academicYears).where(eq(academicYears.id, d.yearId));
  if (!y) return { error: 'noYear' as const };
  const code = `${y.title.replace(/[–—]/g, '-').replace(/\s/g, '')}-${d.number}${d.kind === 'extra' ? 'L' : ''}`;
  if (d.isCurrent) await db.update(academicPeriods).set({ isCurrent: false });
  const [p] = await db.insert(academicPeriods).values({ ...d, code }).returning();
  await audit(user.id, 'calendar.add_period', 'academic_period', p.id, null, { ...d, code });
  revalidatePath('/academic/calendar');
  return { ok: true as const, code };
}

export async function addWindowAction(input: { periodId: string; kind: string; studyForm: string | null; startsAt: string; endsAt: string }) {
  const user = await office();
  const d = z
    .object({ periodId: z.string().uuid(), kind: z.enum(WINDOW_KINDS), studyForm: z.enum(STUDY_FORMS).nullable(), startsAt: z.string(), endsAt: z.string() })
    .parse(input);
  const startsAt = new Date(d.startsAt);
  const endsAt = new Date(d.endsAt);
  if (!(startsAt < endsAt)) return { error: 'badDates' as const };
  const [w] = await db.insert(calendarWindows).values({ ...d, startsAt, endsAt }).returning();
  await audit(user.id, 'calendar.add_window', 'calendar_window', w.id, null, d);
  revalidatePath('/academic/calendar');
  return { ok: true as const };
}

export async function deleteWindowAction(id: string) {
  const user = await office();
  const [w] = await db.select().from(calendarWindows).where(eq(calendarWindows.id, id));
  await db.delete(calendarWindows).where(eq(calendarWindows.id, id));
  await audit(user.id, 'calendar.delete_window', 'calendar_window', id, w, null);
  revalidatePath('/academic/calendar');
}

const SchemeSchema = z.object({
  title: z.string().trim().min(2).max(200),
  currentWeight: z.number().min(0).max(1),
  admissionThreshold: z.number().int().min(0).max(100),
  rkMinScore: z.number().int().min(0).max(100),
  lateRule: z.enum(['none', 'penalty', 'zero']),
  latePenaltyPct: z.number().int().min(0).max(100),
  videoThreshold: z.number().int().min(1).max(100),
  rk1Week: z.number().int().min(1).max(30),
  rk2Week: z.number().int().min(1).max(30),
  isDefault: z.boolean(),
});

export async function saveSchemeAction(id: string | null, input: z.input<typeof SchemeSchema>) {
  const user = await office();
  const d = SchemeSchema.parse(input);
  if (d.isDefault) await db.update(gradeSchemes).set({ isDefault: false });
  if (id) {
    const [before] = await db.select().from(gradeSchemes).where(eq(gradeSchemes.id, id));
    await db.update(gradeSchemes).set({ ...d, updatedAt: new Date() }).where(eq(gradeSchemes.id, id));
    await audit(user.id, 'scheme.update', 'grade_scheme', id, before, d);
  } else {
    const [s] = await db.insert(gradeSchemes).values(d).returning();
    await audit(user.id, 'scheme.create', 'grade_scheme', s.id, null, d);
  }
  revalidatePath('/academic/schemes');
  return { ok: true as const };
}
