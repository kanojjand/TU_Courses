import { desc } from 'drizzle-orm';
import { getFormatter, getTranslations } from 'next-intl/server';
import { NewStaffButton } from '@/components/admin/new-staff';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { userRoles, users } from '@/db/schema';
import { fullName } from '@/lib/utils';

export default async function AdminUsers() {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const [list, roles] = await Promise.all([db.select().from(users).orderBy(desc(users.createdAt)).limit(20000), db.select({ u: userRoles.userId, r: userRoles.role }).from(userRoles)]);
  const rolesBy = new Map<string, string[]>();
  roles.forEach((r) => rolesBy.set(r.u, [...(rolesBy.get(r.u) ?? []), r.r]));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('admin.users.title')} description={t('admin.users.subtitle')} actions={<NewStaffButton />} />
      <DataTable
        fileName="users"
        columns={[
          { key: 'name', header: t('common.fullName') },
          { key: 'login', header: t('admin.users.login') },
          { key: 'roles', header: t('admin.users.roles'), filter: true },
          { key: 'status', header: t('common.status'), filter: true },
          { key: 'last', header: t('admin.users.lastLogin') },
        ]}
        rows={list.map((u) => {
          const r = [...new Set(rolesBy.get(u.id) ?? [])];
          return {
            id: u.id,
            href: `/admin/users/${u.id}`,
            cells: {
              name: fullName(u),
              login: u.login,
              roles: { v: r.map((x) => t(`roles.${x as 'admin'}`)).join(', '), node: <span className="flex flex-wrap gap-1">{r.map((x) => <Badge key={x}>{t(`roles.${x as 'admin'}`)}</Badge>)}</span> },
              status: { v: t(`statuses.user.${u.status}`), node: <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`statuses.user.${u.status}`)}</Badge> },
              last: { v: u.lastLoginAt?.toISOString() ?? null, node: u.lastLoginAt ? format.dateTime(u.lastLoginAt, { dateStyle: 'medium', timeStyle: 'short' }) : '—' },
            },
          };
        })}
      />
    </div>
  );
}
