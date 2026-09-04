import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/server/guards';
import { can } from '@/lib/rbac';
import { isPlatonusEnabled } from '@/integration/platonus/client';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { OutboxTable } from '@/components/admin/outbox-table';
import { pickLocalized } from '@/i18n/request';

export const dynamic = 'force-dynamic';

/** Раздел 9. Интеграция с АИС Platonus: очередь событий и файловый обмен. */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('admin');

  const [events, periods, finalizedCourses] = await Promise.all([
    prisma.integrationOutbox.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.academicPeriod.findMany({
      include: { academicYear: true },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { ordinal: 'asc' }],
    }),
    prisma.course.findMany({
      where: { periodGrades: { some: { isFinalized: true } } },
      include: {
        discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
        period: { include: { academicYear: true } },
        _count: { select: { periodGrades: true } },
      },
      take: 100,
    }),
  ]);

  const enabled = isPlatonusEnabled();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('integrations')}</h1>

      {!enabled && (
        <Alert tone="warning" title="Программный доступ к АИС Platonus не настроен">
          <p className="mb-2">
            Обмен ведётся в резервном файловом режиме (раздел 9.3 ТЗ): импорт контингента
            из XLSX и выгрузка ведомостей в XLSX. Этот режим сохраняется и после подключения
            API как резервный механизм.
          </p>
          <p>
            Для перехода на программный обмен требуется направить официальное письмо
            в ТОО «Платонус» с запросом документации API, учётной записи служебного доступа
            и тестового контура (раздел 9.4), после чего задать переменные окружения
            PLATONUS_ENABLED, PLATONUS_BASE_URL и PLATONUS_API_TOKEN.
          </p>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Файловый обмен (резервный режим)</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Импорт из Platonus</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/templates/users" download>
                  <Button size="sm" variant="outline">
                    <Download size={14} aria-hidden /> Шаблон контингента
                  </Button>
                </a>
                <a href="/api/templates/enrollments" download>
                  <Button size="sm" variant="outline">
                    <Download size={14} aria-hidden /> Шаблон регистраций
                  </Button>
                </a>
              </div>
              <p className="mt-2 text-xs text-fg-muted">
                Загрузка выполняется в разделах «Пользователи» и «Регистрация на курсы».
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Выгрузка в Platonus</p>
              <form className="flex flex-wrap items-end gap-2" action="/api/export/platonus">
                <select
                  name="periodId"
                  className="h-8 rounded-lg border border-border bg-surface px-2 text-sm"
                  defaultValue={periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id}
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.academicYear.name} · {p.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="outline">
                  <Download size={14} aria-hidden /> Итоговые оценки
                </Button>
              </form>
              <p className="mt-2 text-xs text-fg-muted">
                Выгружаются только закрытые (утверждённые) итоговые оценки.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <OutboxTable
        locale={locale}
        canApprove={can(user, 'integration:approve_final')}
        canRetry={can(user, 'integration:manage')}
        platonusEnabled={enabled}
        events={events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          status: e.status,
          attempts: e.attempts,
          maxAttempts: e.maxAttempts,
          requiresApproval: e.requiresApproval,
          approvedAt: e.approvedAt?.toISOString() ?? null,
          lastError: e.lastError,
          createdAt: e.createdAt.toISOString(),
          sentAt: e.sentAt?.toISOString() ?? null,
          nextAttemptAt: e.nextAttemptAt.toISOString(),
        }))}
        courses={finalizedCourses.map((c) => ({
          id: c.id,
          label: `${c.discipline.code} — ${pickLocalized(c.discipline, 'name', locale)}`,
          period: `${c.period.academicYear.name} ${c.period.name}`,
          count: c._count.periodGrades,
        }))}
      />
    </div>
  );
}
