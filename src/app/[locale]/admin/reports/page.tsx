import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Download } from 'lucide-react';

import { prisma, dec } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportFilters } from '@/components/admin/report-filters';
import { HOURS_PER_CREDIT } from '@/domain/constants';

export const dynamic = 'force-dynamic';

/** F-A-06. Отчёты: успеваемость, активность, участие, несоответствие часов. */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ periodId?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'report:view');

  const { periodId } = await searchParams;
  const t = await getTranslations('admin');

  const periods = await prisma.academicPeriod.findMany({
    include: { academicYear: true },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { ordinal: 'asc' }],
  });

  const activePeriodId = periodId ?? periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id;

  // Курсы, не прошедшие проверку по объёму часов
  const courses = await prisma.course.findMany({
    where: { status: { in: ['DRAFT', 'ON_REVIEW', 'REJECTED', 'APPROVED'] } },
    include: {
      discipline: { include: { department: true } },
      period: { include: { academicYear: true } },
      modules: { include: { items: { select: { plannedAcademicHours: true } } } },
    },
    take: 200,
  });

  const invalid = courses
    .map((c) => {
      const planned = c.modules
        .flatMap((m) => m.items)
        .reduce((s, i) => s + dec(i.plannedAcademicHours), 0);
      const required = c.discipline.credits * HOURS_PER_CREDIT;
      return {
        id: c.id,
        name: `${c.discipline.code} — ${pickLocalized(c.discipline, 'name', locale)}`,
        department: pickLocalized(c.discipline.department, 'name', locale),
        period: `${c.period.academicYear.name} ${c.period.name}`,
        status: c.status,
        planned: Math.round(planned * 100) / 100,
        required,
        delta: Math.round((planned - required) * 100) / 100,
      };
    })
    .filter((c) => c.delta !== 0);

  const reports = [
    {
      title: 'Успеваемость по группам, программам и кафедрам',
      description:
        'Баллы РК1, РК2, рейтинг допуска, экзамен, итоговая и буквенная оценка по каждому обучающемуся.',
      href: `/api/export/performance${activePeriodId ? `?periodId=${activePeriodId}` : ''}`,
    },
    {
      title: 'Активность обучающихся и сводка по участию',
      description:
        'Освоенные академические часы, завершённые элементы, время в системе, признак участия. Передаётся в ИС МО в составе данных о посещаемости (п. 40 Типовых правил).',
      href: activePeriodId ? `/api/export/attendance?periodId=${activePeriodId}` : '#',
    },
    {
      title: 'Курсы, не прошедшие проверку по объёму часов',
      description:
        'Курсы, у которых сумма плановых академических часов не соответствует объёму дисциплины в кредитах.',
      href: '/api/export/invalid-courses',
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('reports')}</h1>

      <ReportFilters
        periods={periods.map((p) => ({
          id: p.id,
          label: `${p.academicYear.name} · ${p.name}${p.isCurrent ? ' (текущий)' : ''}`,
        }))}
        selected={activePeriodId ?? ''}
      />

      <div className="grid gap-4 md:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title}>
            <CardBody className="flex h-full flex-col">
              <p className="font-medium leading-snug">{r.title}</p>
              <p className="mt-2 flex-1 text-sm text-fg-muted">{r.description}</p>
              <a href={r.href} download className="mt-4">
                <Button size="sm" variant="outline" className="w-full">
                  <Download size={14} aria-hidden /> XLSX
                </Button>
              </a>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Курсы с несоответствием объёма ({invalid.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {invalid.length === 0 ? (
            <p className="px-5 py-6 text-sm text-success">
              Все неопубликованные курсы соответствуют объёму дисциплин в кредитах.
            </p>
          ) : (
            <div className="scroll-x max-h-96 overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Дисциплина</th>
                    <th>Кафедра</th>
                    <th>Период</th>
                    <th>Статус</th>
                    <th className="text-right">Требуется</th>
                    <th className="text-right">Распределено</th>
                    <th className="text-right">Расхождение</th>
                  </tr>
                </thead>
                <tbody>
                  {invalid.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-normal">{c.name}</td>
                      <td className="text-fg-muted">{c.department}</td>
                      <td className="text-fg-muted">{c.period}</td>
                      <td><Badge>{c.status}</Badge></td>
                      <td className="text-right tabular-nums">{c.required}</td>
                      <td className="text-right tabular-nums">{c.planned}</td>
                      <td className="text-right tabular-nums">
                        <Badge tone={c.delta > 0 ? 'danger' : 'warning'}>
                          {c.delta > 0 ? '+' : ''}
                          {c.delta} ч
                        </Badge>
                      </td>
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
