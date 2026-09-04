import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { authConfig } from './auth.config';
import { prisma } from './lib/prisma';
import type { RoleCode } from './lib/rbac';

/**
 * Аутентификация (F-S-01).
 *
 * Открытая саморегистрация на этапе 1 отключена: учётные записи создаются
 * администратором или импортируются из XLSX.
 *
 * Пароли хранятся bcrypt (раздел 6.3). Реализована блокировка после серии
 * неудачных попыток — ограничение частоты запросов на вход.
 */

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          include: {
            roles: { include: { role: true } },
            studentProfile: { select: { id: true } },
            teacherProfile: { select: { id: true, departmentId: true } },
            consents: {
              where: { revokedAt: null },
              orderBy: { acceptedAt: 'desc' },
              take: 1,
            },
          },
        });

        if (!user || !user.passwordHash) return null;
        if (user.status !== 'ACTIVE') return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);

        if (!ok) {
          const failed = user.failedLogins + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins: failed,
              lockedUntil:
                failed >= MAX_FAILED_LOGINS
                  ? new Date(Date.now() + LOCK_MINUTES * 60_000)
                  : null,
            },
          });
          return null;
        }

        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
          }),
          prisma.activityLog.create({
            data: { userId: user.id, type: 'LOGIN' },
          }),
          prisma.auditLog.create({
            data: {
              actorId: user.id,
              actorEmail: user.email,
              action: 'LOGIN',
              entityType: 'User',
              entityId: user.id,
            },
          }),
        ]);

        const roles = user.roles
          .filter((ur) => !ur.expiresAt || ur.expiresAt > new Date())
          .map((ur) => ur.role.code as RoleCode);

        // Отображаемое имя — на языке интерфейса пользователя
        const name =
          user.uiLanguage === 'KK'
            ? `${user.lastNameKk} ${user.firstNameKk}`
            : user.uiLanguage === 'EN'
              ? `${user.firstNameEn} ${user.lastNameEn}`
              : `${user.lastNameRu} ${user.firstNameRu}`;

        return {
          id: user.id,
          email: user.email,
          name,
          roles,
          uiLanguage: user.uiLanguage,
          studentProfileId: user.studentProfile?.id ?? null,
          teacherProfileId: user.teacherProfile?.id ?? null,
          departmentId: user.teacherProfile?.departmentId ?? null,
          hasConsent: user.consents.length > 0,
          mustChangePassword: user.mustChangePassword,
        } as never;
      },
    }),
  ],
});
