'use client';

import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { setAccessibleModeAction } from '@/server/auth-actions';

export function A11yToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const t = useTranslations('a11y');
  const [pending, start] = useTransition();
  function toggle() {
    const on = !document.documentElement.classList.contains('a11y');
    document.documentElement.classList.toggle('a11y', on);
    start(() => setAccessibleModeAction(on));
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={t('mode')}
      aria-label={t('mode')}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2.5 text-fg-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      <Eye className="size-5" />
      {withLabel && <span className="text-sm">{t('mode')}</span>}
    </button>
  );
}
