import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { AuditFilters } from '@/components/admin/audit-filters';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * F-A-07. Журнал аудита с фильтрами по пользователю, объекту и периоду.
 * Критерий приёмки № 13: фиксируется изменение оценки с прежним и новым значением.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ actor?: string; entity?: string; action?: string; from?: string; to?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'audit:view');

  const sp = await searchParams;
  const t = await getTranslations('admin');

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(sp.actor
        ? { OR: [{ actorEmail: { contains: sp.actor, mode: 'insensitive' } }, { actorId: sp.actor }] }
        : {}),
      ...(sp.entity ? { entityType: sp.entity } : {}),
      ...(sp.action ? { action: { contains: sp.action, mode: 'insensitive' } } : {}),
      ...(sp.from || sp.to
        ? {
            createdAt: {
              ...(sp.from ? { gte: new Date(sp.from) } : {}),
              ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    include: {
      actor: { select: { lastNameRu: true, firstNameRu: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const entityTypes = await prisma.auditLog.findMany({
    distinct: ['entityType'],
    select: { entityType: true },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('audit')}</h1>

      <AuditFilters entityTypes={entityTypes.map((e) => e.entityType)} />

      <Card>
        <CardHeader><CardTitle>Записей: {logs.length}</CardTitle></CardHeader>
        <CardBody className="p-0">
          {logs.length === 0 ? (
            <EmptyState title="Записи не найдены" />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Дата и время</th>
                    <th>Пользователь</th>
                    <th>Действие</th>
                    <th>Объект</th>
                    <th>Прежнее значение</th>
                    <th>Новое значение</th>
                    <th>Основание</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="text-fg-muted">{fmtDateTime(l.createdAt, locale)}</td>
                      <td className="whitespace-normal">
                        {l.actor
                          ? `${l.actor.lastNameRu} ${l.actor.firstNameRu}`
                          : (l.actorEmail ?? 'система')}
                      </td>
                      <td><Badge tone="brand">{l.action}</Badge></td>
                      <td className="text-fg-muted">
                        {l.entityType}
                        {l.entityId && (
                          <span className="block text-xs opacity-60">{l.entityId.slice(0, 24)}</span>
                        )}
                      </td>
                      <td className="max-w-56 whitespace-normal font-mono text-xs text-fg-muted">
                        {l.oldValue ? JSON.stringify(l.oldValue) : '—'}
                      </td>
                      <td className="max-w-56 whitespace-normal font-mono text-xs text-fg-muted">
                        {l.newValue ? JSON.stringify(l.newValue) : '—'}
                      </td>
                      <td className="max-w-48 whitespace-normal text-xs">{l.reason ?? '—'}</td>
                      <td className="text-xs text-fg-muted">{l.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
