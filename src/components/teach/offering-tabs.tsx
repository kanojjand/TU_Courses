'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function OfferingTabs({ base }: { base: string }) {
  const t = useTranslations('teach.tabs');
  const path = usePathname();
  const tabs = [
    { href: base, label: t('journal') },
    { href: `${base}/progress`, label: t('students') },
    { href: `/teach/review?offering=${base.split('/').pop()}`, label: t('review'), match: '/teach/review' },
    { href: `${base}/sheets`, label: t('sheets') },
  ];
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => {
          const on = path === tab.href || path === tab.match;
          return (
            <Link
              key={tab.href}
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
