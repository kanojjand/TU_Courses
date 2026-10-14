'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/roles';
import { NavIcon } from './nav-icon';

function isActive(pathname: string, href: string, all: NavItem[]) {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + '/')) return false;
  // Пункт «/teach» не должен подсвечиваться на «/teach/review», если есть свой пункт
  return !all.some((o) => o.href !== href && o.href.startsWith(href) && (pathname === o.href || pathname.startsWith(o.href + '/')));
}

export function SidebarNav({ items, labels, badges }: { items: NavItem[]; labels: Record<string, string>; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((it) => {
        const on = isActive(pathname, it.href, items);
        const badge = badges?.[it.key];
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors',
              on ? 'bg-brand-soft text-brand' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <NavIcon name={it.icon} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{labels[it.key]}</span>
            {!!badge && <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-fg">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items, labels, badges }: { items: NavItem[]; labels: Record<string, string>; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const mobile = items.filter((i) => i.mobile).slice(0, 4);
  if (mobile.length < 2) return null;
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg">
        {mobile.map((it) => {
          const on = isActive(pathname, it.href, items);
          const badge = badges?.[it.key];
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium', on ? 'text-brand' : 'text-fg-muted')}
            >
              <NavIcon name={it.icon} className="size-6" />
              <span className="max-w-full truncate">{labels[it.key]}</span>
              {!!badge && <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-brand px-1 text-[0.625rem] font-bold text-brand-fg">{badge}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
