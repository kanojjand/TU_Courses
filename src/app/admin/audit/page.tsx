import { desc, eq } from 'drizzle-orm';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { auditLog, users } from '@/db/schema';
import { shortName } from '@/lib/utils';

export default async function AuditPage() {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const rows = await db
    .select({ a: auditLog, u: { lastName: users.lastName, firstName: users.firstName, middleName: users.middleName } })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt))
    .limit(2000);
  const short = (v: unknown) => (v === null || v === undefined ? '' : JSON.stringify(v).slice(0, 160));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('admin.audit.title')} description={t('admin.audit.subtitle')} />
      <DataTable
        fileName="audit"
        dense
        columns={[
          { key: 'date', header: t('common.date') },
          { key: 'who', header: t('admin.audit.who'), filter: true },
          { key: 'action', header: t('admin.audit.action'), filter: true },
          { key: 'object', header: t('admin.audit.object') },
          { key: 'change', header: t('admin.audit.change') },
        ]}
        rows={rows.map(({ a, u }) => ({
          id: String(a.id),
          cells: {
            date: { v: a.createdAt.toISOString(), node: format.dateTime(a.createdAt, { dateStyle: 'short', timeStyle: 'medium' }) },
            who: u?.lastName ? shortName(u) : '—',
            action: a.action,
            object: `${a.entityType ?? ''} ${a.entityId ? a.entityId.slice(0, 8) : ''}`,
            change: { v: `${short(a.before)} → ${short(a.after)}`, node: <span className="font-mono text-xs break-all text-fg-muted">{short(a.before)} → {short(a.after)}</span> },
          },
        }))}
      />
    </div>
  );
}
