'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Info, LifeBuoy, LogOut, User as UserIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ROLE_LABELS, type SessionUser, type RoleCode } from '@/lib/rbac';
import { initials } from '@/lib/utils';

export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

  const lang = user.uiLanguage.toLowerCase() as 'kk' | 'ru' | 'en';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 hover:bg-muted"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm sm:inline">{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 w-60 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {user.roles.map((r) => ROLE_LABELS[r as RoleCode]?.[lang] ?? r).join(', ')}
            </p>
          </div>
          <Link
            href="/my/profile"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <UserIcon size={15} aria-hidden /> Профиль
          </Link>
          <Link
            href="/about"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <Info size={15} aria-hidden /> {t('about')}
          </Link>
          <Link
            href="/support"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            <LifeBuoy size={15} aria-hidden /> {t('support')}
          </Link>
          <div className="my-1 border-t border-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: `/${lang}` })}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-muted"
          >
            <LogOut size={15} aria-hidden /> Выйти
          </button>
        </div>
      )}
    </div>
  );
}
