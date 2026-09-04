import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import type { SessionUser } from '@/lib/rbac';
import { adminSectionsFor, hasRole } from '@/lib/rbac';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { Button } from '@/components/ui/button';

export async function SiteHeader({
  locale,
  user,
}: {
  locale: AppLocale;
  user: SessionUser | null;
}) {
  const t = await getTranslations('nav');
  const tc = await getTranslations('common');

  const links: { href: string; label: string }[] = [
    { href: '/courses', label: t('catalog') },
    { href: '/about', label: t('about') },
    { href: '/support', label: t('support') },
  ];

  if (user) {
    if (hasRole(user, 'STUDENT')) {
      links.unshift(
        { href: '/dashboard', label: t('dashboard') },
        { href: '/my/courses', label: t('myCourses') },
        { href: '/my/grades', label: t('grades') }
      );
    }
    if (hasRole(user, 'TEACHER', 'TUTOR')) {
      links.unshift({ href: '/teach', label: t('teach') });
    }
    if (hasRole(user, 'ADVISOR')) {
      links.unshift({ href: '/advisor', label: t('advisees') });
    }
    // Преподаватель формально имеет доступ к ведомостям и отчётам, но
    // администратором не является — раздел показываем только тем ролям,
    // для которых он рабочий. Адрес берём из первого доступного раздела:
    // жёсткий /admin/users отправлял методиста и офис регистратора туда,
    // где у них нет прав.
    if (hasRole(user, 'ADMIN', 'REGISTRAR', 'METHODIST')) {
      const [adminSection] = adminSectionsFor(user);
      if (adminSection) {
        links.unshift({ href: `/admin/${adminSection}`, label: t('admin') });
      }
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-fg"
          >
            LMS
          </span>
          <span className="hidden text-sm sm:inline">{tc('appName')}</span>
        </Link>

        <nav aria-label="Основная навигация" className="scroll-x hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-muted hover:text-fg"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <LocaleSwitcher current={locale} />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link href="/login">
              <Button size="sm">{tc('login')}</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Мобильная навигация (раздел 6.5: адаптив от 360 px) */}
      <nav aria-label="Мобильная навигация" className="scroll-x border-t border-border md:hidden">
        <ul className="flex min-w-max items-center gap-1 px-3 py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-muted hover:text-fg"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
