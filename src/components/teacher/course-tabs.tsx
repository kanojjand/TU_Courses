'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function CourseTabs({ courseId }: { courseId: string }) {
  const t = useTranslations('teacher');
  const pathname = usePathname();
  const base = `/teach/courses/${courseId}`;

  const tabs = [
    { href: base, label: 'Обзор', exact: true },
    { href: `${base}/builder`, label: t('builder') },
    { href: `${base}/syllabus`, label: t('syllabus') },
    { href: `${base}/questions`, label: t('questionBank') },
    { href: `${base}/gradebook`, label: t('gradebook') },
    { href: `${base}/attendance`, label: 'Посещаемость' },
    { href: `${base}/submissions`, label: t('submissions') },
    { href: `${base}/analytics`, label: t('analytics') },
  ];

  return (
    <nav aria-label="Разделы курса" className="scroll-x border-b border-border">
      <ul className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-fg-muted hover:border-border hover:text-fg'
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
