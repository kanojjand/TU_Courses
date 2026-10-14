import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { RoleManager, UserActions } from '@/components/admin/user-admin';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { departments, faculties, programs, studyGroups, userRoles, users } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { fullName, isUuid } from '@/lib/utils';

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!isUuid(userId)) notFound();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) notFound();
  const [roles, facs, deps, progs, groups] = await Promise.all([
    db.select().from(userRoles).where(eq(userRoles.userId, userId)),
    db.select().from(faculties),
    db.select().from(departments),
    db.select().from(programs),
    db.select().from(studyGroups),
  ]);
  const label = (type: string, id: string | null) => {
    if (!id) return '';
    if (type === 'faculty') return pickName(facs.find((x) => x.id === id), locale);
    if (type === 'department') return pickName(deps.find((x) => x.id === id), locale);
    if (type === 'program') return progs.find((x) => x.id === id)?.code ?? '';
    if (type === 'group') return groups.find((x) => x.id === id)?.code ?? '';
    return '';
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={fullName(u)}
        back={{ href: '/admin', label: t('admin.users.title') }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {u.login}
            <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{t(`statuses.user.${u.status}`)}</Badge>
            {u.lastLoginAt && <span>· {format.dateTime(u.lastLoginAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </span>
        }
      />
      <Card className="mb-5">
        <CardBody>
          <UserActions userId={u.id} status={u.status} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('admin.users.roles')} />
        <CardBody>
          <RoleManager
            userId={u.id}
            roles={roles.map((r) => ({ id: r.id, role: r.role, scopeType: r.scopeType, scopeLabel: label(r.scopeType, r.scopeId) }))}
            options={{
              faculty: facs.map((f) => ({ id: f.id, label: pickName(f, locale) })),
              department: deps.map((d) => ({ id: d.id, label: pickName(d, locale) })),
              program: progs.map((p) => ({ id: p.id, label: `${p.code} · ${pickName(p, locale)}` })),
              group: groups.map((g) => ({ id: g.id, label: g.code })),
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
