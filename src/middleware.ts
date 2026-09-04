import createMiddleware from 'next-intl/middleware';
import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';

import { authConfig } from './auth.config';
import { routing } from './i18n/routing';

/**
 * Маршрутизация по локали (F-L-02) + защита приватных разделов.
 *
 * Разграничение прав внутри разделов выполняется на уровне серверных
 * компонентов и действий (src/server/guards.ts); middleware решает только
 * задачу «аутентифицирован / нет» и подстановки префикса локали.
 */

const intlMiddleware = createMiddleware(routing);
const { auth } = NextAuth(authConfig);

/** Маршруты, требующие входа (без префикса локали) */
const PROTECTED = ['/dashboard', '/my', '/teach', '/admin'];

/** Маршруты, доступные без принятого согласия на обработку ПДн */
const CONSENT_EXEMPT = ['/consent', '/privacy', '/logout', '/profile/password'];

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(kk|ru|en)(\/.*)?$/);
  return match ? (match[2] ?? '/') : pathname;
}

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;

  // Служебные маршруты — без обработки локалью
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const session = req.auth as { user?: { hasConsent?: boolean; mustChangePassword?: boolean } } | null;
  const path = stripLocale(pathname);
  const locale = pathname.match(/^\/(kk|ru|en)(\/|$)/)?.[1] ?? routing.defaultLocale;

  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  if (isProtected && !session?.user) {
    const url = new URL(`/${locale}/login`, req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  if (session?.user && isProtected) {
    const exempt = CONSENT_EXEMPT.some((p) => path.startsWith(p));

    // F-S-02 — обязательное принятие согласия при первом входе
    if (!session.user.hasConsent && !exempt) {
      return NextResponse.redirect(new URL(`/${locale}/consent`, req.url));
    }

    // Принудительная смена временного пароля после импорта
    if (session.user.mustChangePassword && !exempt) {
      return NextResponse.redirect(new URL(`/${locale}/profile/password`, req.url));
    }
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
