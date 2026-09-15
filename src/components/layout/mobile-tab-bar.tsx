'use client';

import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { Link, usePathname, type AppLocale } from '@/i18n/routing';
import { isNavActive, type NavItem } from '@/lib/navigation';
import { ROLE_LABELS, type RoleCode, type SessionUser } from '@/lib/rbac';
import { cn, initials } from '@/lib/utils';
import { LocaleSwitcher } from './locale-switcher';
import { NavIcon } from './nav-icon';
import { ThemeToggle } from './theme-toggle';

/**
 * Нижняя панель навигации на телефоне — как в мобильном приложении.
 *
 * Большинство обучающихся заходит с телефона, а верхняя полоса с прокруткой
 * прятала часть разделов за краем экрана и была вне досягаемости большого
 * пальца. Здесь четыре главных раздела всегда видны внизу, всё остальное —
 * в листе «Ещё», там же язык, тема и выход.
 *
 * На странице теста панель скрыта: лишняя кнопка рядом с вопросами — это
 * случайный уход со страницы посреди попытки.
 */
export function MobileTabBar({
  primary,
  secondary,
  user,
  locale,
}: {
  primary: NavItem[];
  secondary: NavItem[];
  user: SessionUser | null;
  locale: AppLocale;
}) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (pathname.includes('/quiz/')) return null;

  const moreActive = secondary.some((item) => isNavActive(item, pathname));
  // Подписи ролей — на языке, который сейчас на экране, а не из профиля:
  // иначе при русском интерфейсе роль выводилась по-казахски
  const lang = locale;

  return (
    <>
      {/* Место под панель, чтобы она не перекрывала низ страницы и подвал */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />

      <nav
        aria-label="Навигация"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {primary.map((item) => {
            const active = isNavActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
                    active ? 'text-brand' : 'text-fg-muted active:text-fg'
                  )}
                >
                  {active && (
                    <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
                  )}
                  <NavIcon name={item.icon} size={22} />
                  <span className="max-w-full truncate px-1">{t(item.label as never)}</span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={cn(
                'relative flex h-full w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
                moreActive ? 'text-brand' : 'text-fg-muted active:text-fg'
              )}
            >
              {moreActive && (
                <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
              )}
              <Menu size={22} aria-hidden />
              {t('more')}
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('menu')}>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 animate-fade-up"
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg animate-fade-up">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
              {user ? (
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg">
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {user.roles.map((r) => ROLE_LABELS[r as RoleCode]?.[lang] ?? r).join(', ')}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-base font-semibold">{t('menu')}</p>
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть меню"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-muted"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            {secondary.length > 0 && (
              <ul className="p-2">
                {secondary.map((item) => {
                  const active = isNavActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-12 items-center gap-3 rounded-lg px-3 text-[0.9375rem]',
                          active ? 'bg-brand-soft font-medium text-brand' : 'text-fg active:bg-muted'
                        )}
                      >
                        <NavIcon name={item.icon} size={20} className={active ? '' : 'text-fg-muted'} />
                        {t(item.label as never)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mx-4 space-y-1 border-t border-border py-3">
              <div className="flex min-h-12 items-center justify-between gap-3">
                <span className="text-[0.9375rem]">{t('language')}</span>
                <LocaleSwitcher current={locale} />
              </div>
              <div className="flex min-h-12 items-center justify-between gap-3">
                <span className="text-[0.9375rem]">{t('theme')}</span>
                <ThemeToggle />
              </div>
            </div>

            <div className="mx-4 space-y-2 border-t border-border pt-3">
              {user ? (
                <>
                  <Link
                    href="/my/profile"
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-[0.9375rem] active:bg-muted"
                  >
                    <UserIcon size={20} aria-hidden className="text-fg-muted" />
                    {t('profile')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: `/${locale}` })}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] text-danger active:bg-muted"
                  >
                    <LogOut size={20} aria-hidden />
                    {t('logout')}
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand text-[0.9375rem] font-semibold text-brand-fg shadow-brand"
                >
                  <LogIn size={18} aria-hidden />
                  {tc('login')}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
