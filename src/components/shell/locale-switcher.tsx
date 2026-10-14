'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { localeLabels, locales } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { setLocaleAction } from '@/server/auth-actions';

/** Переключатель языка в шапке: три кнопки, видно сразу, без лишних меню */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label="Language" className={cn('inline-flex rounded-lg border border-border bg-surface p-0.5', pending && 'opacity-60', className)}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={localeLabels[l].full}
          aria-pressed={l === locale}
          onClick={() =>
            start(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={cn(
            'h-9 min-w-10 rounded-md px-1.5 text-xs font-semibold tracking-wide transition-colors sm:min-w-11 sm:px-2',
            l === locale ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {localeLabels[l].short}
        </button>
      ))}
    </div>
  );
}
