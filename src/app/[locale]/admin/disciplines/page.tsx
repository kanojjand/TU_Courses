import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { HOURS_PER_CREDIT } from '@/domain/constants';

export const dynamic = 'force-dynamic';

/** F-A-02. Справочник дисциплин. */
export default async function DisciplinesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'reference:manage', 'report:view');
  const t = await getTranslations('admin');

  const disciplines = await prisma.discipline.findMany({
    include: {
      department: true,
      program: { select: { code: true } },
      _count: { select: { courses: true } },
    },
    orderBy: [{ department: { code: 'asc' } }, { code: 'asc' }],
    take: 500,
  });

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{t('disciplines')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Всего: {disciplines.length}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {disciplines.length === 0 ? (
            <EmptyState title="Справочник дисциплин пуст" />
          ) : (
            <div className="scroll-x max-h-[75vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Наименование</th>
                    <th>Кафедра</th>
                    <th>ОП</th>
                    <th>Цикл</th>
                    <th>Компонент</th>
                    <th>Язык</th>
                    <th className="text-right">Кредитов</th>
                    <th className="text-right">Часов</th>
                    <th>Профиль</th>
                    <th className="text-right">Курсов</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplines.map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.code}</td>
                      <td className="whitespace-normal">{pickLocalized(d, 'name', locale)}</td>
                      <td className="text-fg-muted">{d.department.code}</td>
                      <td className="text-fg-muted">{d.program?.code ?? '—'}</td>
                      <td><Badge>{d.cycle}</Badge></td>
                      <td><Badge>{d.component}</Badge></td>
                      <td>{d.language}</td>
                      <td className="text-right tabular-nums font-medium">{d.credits}</td>
                      <td className="text-right tabular-nums text-fg-muted">
                        {d.credits * HOURS_PER_CREDIT}
                      </td>
                      <td>
                        {d.gradingProfile === 'LANGUAGE' ? (
                          <Badge tone="brand">языковая (ОЕК)</Badge>
                        ) : (
                          <span className="text-fg-muted">стандартный</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{d._count.courses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
