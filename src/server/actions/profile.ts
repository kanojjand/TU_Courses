'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';

/** F-S-02. Принятие согласия на обработку ПДн с фиксацией даты и версии. */
export async function acceptConsent(version: string): Promise<void> {
  const user = await requireUser();
  const h = await headers();

  await prisma.consent.upsert({
    where: {
      userId_documentCode_version: { userId: user.id, documentCode: 'PDP', version },
    },
    create: {
      userId: user.id,
      documentCode: 'PDP',
      version,
      ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
    update: { revokedAt: null },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.CONSENT_ACCEPT,
    entityType: 'Consent',
    entityId: user.id,
    newValue: { version },
  });
}

const passwordSchema = z
  .object({
    current: z.string().optional(),
    next: z
      .string()
      .min(10, 'Пароль должен содержать не менее 10 символов')
      .regex(/[a-zа-я]/i, 'Пароль должен содержать буквы')
      .regex(/\d/, 'Пароль должен содержать цифры'),
    repeat: z.string(),
  })
  .refine((d) => d.next === d.repeat, { message: 'Пароли не совпадают', path: ['repeat'] });

/** Смена пароля. Обязательна после импорта учётной записи. */
export async function changePassword(input: {
  current?: string;
  next: string;
  repeat: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Некорректные данные' };
  }

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, mustChangePassword: true },
  });

  // При принудительной смене временного пароля текущий не запрашивается
  if (!record.mustChangePassword) {
    if (!input.current) return { ok: false, error: 'Укажите текущий пароль' };
    const ok = await bcrypt.compare(input.current, record.passwordHash ?? '');
    if (!ok) return { ok: false, error: 'Текущий пароль неверен' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.next, 12),
      mustChangePassword: false,
      failedLogins: 0,
      lockedUntil: null,
    },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.PASSWORD_RESET,
    entityType: 'User',
    entityId: user.id,
    newValue: { self: true },
  });

  return { ok: true };
}

/** F-L-02. Сохранение выбранного языка интерфейса в профиле. */
export async function setUiLanguage(locale: 'kk' | 'ru' | 'en'): Promise<void> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { uiLanguage: locale.toUpperCase() as 'KK' | 'RU' | 'EN' },
  });
}

/** Отметка уведомлений как прочитанных (F-S-10) */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, ...(ids ? { id: { in: ids } } : {}), isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath('/dashboard');
}
