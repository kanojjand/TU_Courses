import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-совместимая часть конфигурации Auth.js.
 * Prisma здесь недоступна — middleware на Vercel выполняется в Edge Runtime,
 * поэтому провайдеры и работа с БД вынесены в src/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 часов
    updateAge: 30 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          roles?: string[];
          uiLanguage?: string;
          studentProfileId?: string | null;
          teacherProfileId?: string | null;
          departmentId?: string | null;
          hasConsent?: boolean;
          mustChangePassword?: boolean;
          name?: string | null;
        };
        token.roles = u.roles ?? [];
        token.uiLanguage = u.uiLanguage ?? 'KK';
        token.studentProfileId = u.studentProfileId ?? null;
        token.teacherProfileId = u.teacherProfileId ?? null;
        token.departmentId = u.departmentId ?? null;
        token.hasConsent = Boolean(u.hasConsent);
        token.mustChangePassword = Boolean(u.mustChangePassword);
        token.fullName = u.name ?? '';
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.uiLanguage = (token.uiLanguage as string) ?? 'KK';
        session.user.studentProfileId = (token.studentProfileId as string | null) ?? null;
        session.user.teacherProfileId = (token.teacherProfileId as string | null) ?? null;
        session.user.departmentId = (token.departmentId as string | null) ?? null;
        session.user.hasConsent = Boolean(token.hasConsent);
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.name = (token.fullName as string) ?? session.user.name;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
