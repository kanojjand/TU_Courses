'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/routing';
import { isNavActive, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { NavIcon } from './nav-icon';

/**
 * Верхнее меню для компьютера: главные пункты роли и выпадающее «Ещё».
 *
 * Текущий раздел подсвечивается — раньше меню было одинаковым на любой
 * странице, и понять, где ты находишься, можно было только по заголовку.
 */
export function MainNav({ primary, secondary }: { primary: NavItem[]; secondary: NavItem[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moreActive = secondary.some((item) => isNavActive(item, pathname));

  return (
    <nav aria-label="Основная навигация" className="hidden flex-1 md:block">
      <ul className="flex items-center gap-1">
        {primary.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-soft text-brand'
                    : 'text-fg-muted hover:bg-muted hover:text-fg'
                )}
              >
                <NavIcon name={item.icon} size={16} />
                {t(item.label as never)}
              </Link>
            </li>
          );
        })}

        {secondary.length > 0 && (
          <li className="relative" ref={ref}>
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                moreActive || open
                  ? 'bg-brand-soft text-brand'
                  : 'text-fg-muted hover:bg-muted hover:text-fg'
              )}
            >
              {t('more')}
              <ChevronDown
                size={15}
                aria-hidden
                className={cn('transition-transform', open && 'rotate-180')}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute left-0 top-12 z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
              >
                {secondary.map((item) => {
                  const active = isNavActive(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                        active ? 'bg-brand-soft font-medium text-brand' : 'text-fg hover:bg-muted'
                      )}
                    >
                      <NavIcon name={item.icon} size={17} className="text-fg-muted" />
                      {t(item.label as never)}
                    </Link>
                  );
                })}
              </div>
            )}
          </li>
        )}
      </ul>
    </nav>
  );
}
