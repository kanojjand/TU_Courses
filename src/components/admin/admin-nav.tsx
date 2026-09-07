'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const LABEL_KEYS: Record<string, string> = {
  users: 'users',
  programs: 'programs',
  disciplines: 'disciplines',
  curricula: 'curricula',
  groups: 'groups',
  ieps: 'ieps',
  periods: 'periods',
  enrollments: 'enrollments',
  courses: 'courses',
  gradesheets: 'gradesheets',
  appeals: 'appeals',
  announcements: 'announcements',
  reports: 'reports',
  integrations: 'integrations',
  audit: 'audit',
  settings: 'settings',
};

export function AdminNav({ sections }: { sections: string[] }) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы администрирования" className="lg:sticky lg:top-20 lg:self-start">
      <ul className="scroll-x flex gap-1 lg:flex-col">
        {sections.map((s) => {
          const href = `/admin/${s}`;
          const active = pathname.startsWith(href);
          return (
            <li key={s}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-brand/12 font-medium text-brand' : 'text-fg-muted hover:bg-muted hover:text-fg'
                )}
              >
                {t(LABEL_KEYS[s] as never)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
