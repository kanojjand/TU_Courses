import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import type { SessionUser } from '@/lib/rbac';
import { navigationFor } from '@/lib/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { MainNav } from './main-nav';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

/**
 * Шапка сайта.
 *
 * Пункты меню задаёт `navigationFor` — тот же набор, что и у нижней панели на
 * телефоне. На узком экране шапка сокращается до логотипа и входа: навигация
 * живёт внизу (MobileTabBar), язык и тема — в листе «Ещё».
 */
export async function SiteHeader({
  locale,
  user,
}: {
  locale: AppLocale;
  user: SessionUser | null;
}) {
  const tc = await getTranslations('common');
  const { primary, secondary } = navigationFor(user);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:h-16 md:gap-6">
        <Link
          href="/"
          className="rounded-lg focus-visible:ring-offset-4"
          aria-label={tc('appName')}
        >
          <Logo subtitle="University" />
        </Link>

        {/* Логотип и так ведёт на главную — отдельный пункт «Главная» у гостя не нужен */}
        <MainNav primary={primary.filter((item) => item.href !== '/')} secondary={secondary} />

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            <ThemeToggle />
            <LocaleSwitcher current={locale} />
          </div>
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link href="/login">
              <Button size="sm">{tc('login')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
