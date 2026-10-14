import { Bell, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Role } from '@/db/schema';
import type { SessionUser } from '@/lib/auth';
import { navBadges, unreadCount } from '@/lib/badges';
import { rolesOf } from '@/lib/rbac';
import { ROLE_HOME, ROLE_NAV } from '@/lib/roles';
import { fullName, initials } from '@/lib/utils';
import { A11yToggle } from './a11y-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';
import { BottomNav, SidebarNav } from './nav-links';
import { UserMenu } from './user-menu';

/**
 * Каркас всех кабинетов: один дизайн и одна навигация,
 * наполнение меню зависит от роли (раздел 8 ТЗ).
 */
export async function AppShell({ user, role, children }: { user: SessionUser; role: Role | null; children: React.ReactNode }) {
  const t = await getTranslations();
  const items = role ? ROLE_NAV[role] : [];
  const labels = Object.fromEntries(items.map((i) => [i.key, t(`nav.${i.key}` as 'nav.myCourses')]));
  const [badges, unread] = await Promise.all([role ? navBadges(user, role) : Promise.resolve({}), unreadCount(user.id)]);
  const roles = rolesOf(user);
  const home = role ? ROLE_HOME[role] : '/profile';

  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <a href="#main" className="sr-only z-50 rounded bg-brand px-3 py-2 text-brand-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {t('nav.skipToContent')}
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-2 px-3 sm:px-5">
          <Link href={home} className="mr-2 inline-flex min-h-11 items-center" aria-label="TU Online">
            <Logo wordmarkClass="hidden min-[420px]:inline" />
          </Link>
          {role && (
            <span className="hidden truncate rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted sm:inline-block">
              {t(`roles.${role}`)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher />
            <A11yToggle className="hidden sm:inline-flex" />
            <Link
              href="/notifications"
              className="relative inline-flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t('nav.notifications')}
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-4 rounded-full bg-brand px-1 text-center text-[0.625rem] leading-4 font-bold text-brand-fg">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            <UserMenu name={fullName(user)} initials={initials(user)} roles={roles} current={role} />
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[90rem]">
        {items.length > 0 && (
          <aside className="no-print sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-border px-3 py-5 lg:block">
            <SidebarNav items={items} labels={labels} badges={badges} />
          </aside>
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          {user.mustChangePassword && (
            <Link
              href="/profile#password"
              className="no-print mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm"
            >
              <KeyRound className="size-5 shrink-0 text-warning" />
              <span className="font-medium">{t('auth.changePasswordTitle')}</span>
            </Link>
          )}
          {children}
        </main>
      </div>
      {items.length > 0 && <BottomNav items={items} labels={labels} badges={badges} />}
    </div>
  );
}
