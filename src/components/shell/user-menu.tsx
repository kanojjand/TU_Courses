'use client';

import { Check, Eye, LogOut, Repeat, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import type { Role } from '@/db/schema';
import { ROLE_HOME } from '@/lib/roles';
import { logoutAction, setAccessibleModeAction } from '@/server/auth-actions';

export function UserMenu({ name, initials, roles, current }: { name: string; initials: string; roles: Role[]; current: Role | null }) {
  const t = useTranslations();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg pr-1 pl-1 hover:bg-surface-2 sm:pr-2"
          aria-label={name}
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-fg">{initials}</span>
          <span className="hidden max-w-40 truncate text-sm font-medium md:inline">{name}</span>
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-72">
        <DropdownLabel>{name}</DropdownLabel>
        {roles.length > 1 && (
          <>
            <DropdownSeparator />
            <DropdownLabel>
              <span className="inline-flex items-center gap-1.5">
                <Repeat className="size-3.5" />
                {t('roles.switchRole')}
              </span>
            </DropdownLabel>
            {roles.map((r) => (
              <DropdownItem key={r} asChild>
                <Link href={ROLE_HOME[r]}>
                  <span className="flex-1">{t(`roles.${r}`)}</span>
                  {r === current && <Check className="!text-brand" />}
                </Link>
              </DropdownItem>
            ))}
          </>
        )}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/profile">
            <UserRound />
            {t('nav.profile')}
          </Link>
        </DropdownItem>
        <DropdownItem
          onSelect={() => {
            const on = !document.documentElement.classList.contains('a11y');
            document.documentElement.classList.toggle('a11y', on);
            void setAccessibleModeAction(on);
          }}
        >
          <Eye />
          {t('a11y.mode')}
        </DropdownItem>
        <DropdownItem onSelect={() => logoutAction()}>
          <LogOut />
          {t('nav.logout')}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
