import { NextResponse, type NextRequest } from 'next/server';
import { roleForPath } from '@/lib/roles';

const PUBLIC_PREFIXES = ['/login', '/api/bunny', '/api/cron', '/api/health', '/brand', '/templates'];

/**
 * Быстрая проверка до рендера: без cookie сессии — на вход.
 * Саму сессию проверяет сервер (getCurrentUser), здесь только наличие cookie.
 * Заодно запоминаем роль раздела, чтобы общие страницы показывали её меню.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has('tu_session');
  if (!hasSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname + search)}` : '';
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  const role = roleForPath(pathname);
  if (role && request.cookies.get('tu_role')?.value !== role) {
    response.cookies.set('tu_role', role, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 180 });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|robots.txt).*)'],
};
