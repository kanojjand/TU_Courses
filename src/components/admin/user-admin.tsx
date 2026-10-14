'use client';

import { KeyRound, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/input';
import { ROLES, type Role, type ScopeType } from '@/db/schema';
import { ROLE_SCOPE } from '@/lib/roles';
import { grantRoleAction, resetPasswordAction, revokeRoleAction, setUserStatusAction } from '@/server/admin-actions';

type Opt = { id: string; label: string };

export function UserActions({ userId, status }: { userId: string; status: 'active' | 'blocked' }) {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const [pwd, setPwd] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await resetPasswordAction(userId); if ('password' in r) setPwd(r.password ?? null); })}>
          <KeyRound />
          {t('resetPassword')}
        </Button>
        <Button
          variant={status === 'active' ? 'danger' : 'success'}
          disabled={pending}
          onClick={() => start(async () => (await setUserStatusAction(userId, status === 'active' ? 'blocked' : 'active'), router.refresh()))}
        >
          {status === 'active' ? <Lock /> : <Unlock />}
          {status === 'active' ? t('block') : t('unblock')}
        </Button>
      </div>
      {pwd && <p className="rounded-lg bg-success-soft p-3 font-mono font-medium text-success">{t('newPassword', { password: pwd })}</p>}
    </div>
  );
}

export function RoleManager({
  userId,
  roles,
  options,
}: {
  userId: string;
  roles: { id: string; role: Role; scopeType: ScopeType; scopeLabel: string }[];
  options: { faculty: Opt[]; department: Opt[]; group: Opt[]; program: Opt[] };
}) {
  const t = useTranslations();
  const router = useRouter();
  const [role, setRole] = useState<Role>('author');
  const [scopeType, setScopeType] = useState<ScopeType>(ROLE_SCOPE.author);
  const [pending, start] = useTransition();
  const scopeOpts = scopeType === 'university' ? [] : (options[scopeType as 'faculty'] ?? []);
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {roles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
            <Badge tone="brand">{t(`roles.${r.role}`)}</Badge>
            <span className="text-sm text-fg-muted">
              {t(`roles.scope.${r.scopeType}`)}
              {r.scopeLabel ? `: ${r.scopeLabel}` : ''}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              className="ml-auto"
              disabled={pending}
              aria-label={t('common.delete')}
              onClick={() => window.confirm(t('admin.users.removeRole')) && start(async () => (await revokeRoleAction(r.id), router.refresh()))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const res = await grantRoleAction(userId, { role, scopeType, scopeId: scopeType === 'university' ? null : String(fd.get('scopeId') ?? '') || null });
            if ('error' in res) toast.error(t('common.somethingWrong'));
            router.refresh();
          });
        }}
      >
        <Field label={t('admin.users.role')}>
          <Select
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              setScopeType(ROLE_SCOPE[r]);
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.users.scope')}>
          <Select value={scopeType} onChange={(e) => setScopeType(e.target.value as ScopeType)}>
            {(['university', 'faculty', 'department', 'program', 'group'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`roles.scope.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.users.scopeObject')}>
          <Select name="scopeId" disabled={scopeType === 'university'}>
            {scopeOpts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          <Plus />
          {t('admin.users.addRole')}
        </Button>
      </form>
      <p className="text-xs text-fg-muted">{t('admin.users.roleHint')}</p>
    </div>
  );
}
