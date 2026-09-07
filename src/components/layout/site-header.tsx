import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import type { SessionUser } from '@/lib/rbac';
import { adminSectionsFor, hasRole } from '@/lib/rbac';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

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
    // F-CUR-11: каталог элективных дисциплин открыт всем — студент выбирает
    // дисциплины до того, как сядет за ИУП
    { href: '/electives', label: t('electives') },
    { href: '/about', label: t('about') },
    { href: '/support', label: t('support') },
  ];

  if (user) {
    // F-COM-01: чаты доступны всем ролям, а не только обучающимся
    links.unshift({ href: '/my/chats', label: t('chats') });
    if (hasRole(user, 'STUDENT')) {
      links.unshift(
        { href: '/dashboard', label: t('dashboard') },
        { href: '/my/courses', label: t('myCourses') },
        { href: '/my/iep', label: t('iep') },
        { href: '/my/grades', label: t('grades') },
        { href: '/my/practice', label: t('practice') }
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
    <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:gap-4">
        <Link
          href="/"
          className="rounded-lg focus-visible:ring-offset-4"
          aria-label={tc('appName')}
        >
          {/* На узком экране словесная часть уступает место навигации */}
          <Logo className="sm:hidden" compact />
          <Logo className="hidden sm:flex" subtitle="University" />
        </Link>

        <nav aria-label="Основная навигация" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-0.5">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand"
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

      {/* Мобильная навигация (раздел 6.5: адаптив от 360 px).
          Полоса с горизонтальной прокруткой: пунктов у роли бывает до семи,
          в одну строку узкого экрана они не помещаются. */}
      <nav
        aria-label="Мобильная навигация"
        className="scroll-x border-t border-border bg-surface md:hidden"
      >
        <ul className="flex min-w-max items-center gap-1 px-3 py-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand"
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
