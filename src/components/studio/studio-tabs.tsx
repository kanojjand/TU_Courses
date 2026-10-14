'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function StudioTabs({ courseId }: { courseId: string }) {
  const t = useTranslations('studio.builder');
  const path = usePathname();
  const base = `/studio/${courseId}`;
  const tabs = [
    { href: base, label: t('structure'), key: 'structure' },
    { href: `${base}/questions`, label: t('questions'), key: 'questions' },
    { href: `${base}/import`, label: t('import'), key: 'import' },
    { href: `${base}/preview`, label: t('preview'), key: 'preview' },
    { href: `${base}/settings`, label: t('settings'), key: 'settings' },
  ];
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => {
          const on = tab.href === base ? path === base || path.startsWith(`${base}/lessons`) : path.startsWith(tab.href);
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={on ? 'page' : undefined}
              className={cn('-mb-px inline-flex min-h-11 items-center border-b-2 px-3.5 text-[0.9375rem] font-medium', on ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
