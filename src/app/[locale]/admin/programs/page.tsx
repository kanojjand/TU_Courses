import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/** F-A-02. Справочник образовательных программ, факультетов и кафедр. */
export default async function ProgramsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'reference:manage', 'report:view');
  const t = await getTranslations('admin');

  const faculties = await prisma.faculty.findMany({
    include: {
      departments: {
        include: {
          programs: { include: { _count: { select: { disciplines: true, students: true } } } },
          _count: { select: { disciplines: true, teachers: true } },
        },
        orderBy: { code: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  });

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{t('programs')}</h1>

      {faculties.length === 0 ? (
        <EmptyState
          title="Справочники не загружены"
          description="Загрузите структуру вуза: факультеты, кафедры и образовательные программы."
        />
      ) : (
        <div className="space-y-5">
          {faculties.map((f) => (
            <Card key={f.id}>
              <CardHeader>
                <CardTitle>
                  {f.code} · {pickLocalized(f, 'name', locale)}
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                {f.departments.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {d.code} · {pickLocalized(d, 'name', locale)}
                      </p>
                      <Badge>{d._count.disciplines} дисциплин</Badge>
                      <Badge>{d._count.teachers} ППС</Badge>
                    </div>
                    {d.programs.length > 0 && (
                      <div className="scroll-x">
                        <table className="table-dense">
                          <thead>
                            <tr>
                              <th>Код</th>
                              <th>Наименование</th>
                              <th>Уровень</th>
                              <th>Язык</th>
                              <th className="text-right">Срок, лет</th>
                              <th className="text-right">Кредитов</th>
                              <th className="text-right">Дисциплин</th>
                              <th className="text-right">Студентов</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.programs.map((p) => (
                              <tr key={p.id}>
                                <td className="font-medium">{p.code}</td>
                                <td className="whitespace-normal">
                                  {pickLocalized(p, 'name', locale)}
                                </td>
                                <td>{p.level}</td>
                                <td>{p.language}</td>
                                <td className="text-right tabular-nums">{p.durationYears}</td>
                                <td className="text-right tabular-nums">{p.totalCredits}</td>
                                <td className="text-right tabular-nums">{p._count.disciplines}</td>
                                <td className="text-right tabular-nums">{p._count.students}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
