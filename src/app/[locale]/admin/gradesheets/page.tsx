import { setRequestLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireUser } from '@/server/guards';
import { can, hasRole } from '@/lib/rbac';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-A-05. Все журналы и ведомости; согласование курсов методистом. */
export default async function GradeSheetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('admin');
  const tg = await getTranslations('grades');

  const isMethodist = hasRole(user, 'METHODIST');

  const [sheets, pendingReview] = await Promise.all([
    can(user, 'gradesheet:view')
      ? prisma.gradeSheet.findMany({
          include: {
            course: {
              include: {
                discipline: true,
                period: { include: { academicYear: true } },
              },
            },
            closedBy: { select: { lastNameRu: true, firstNameRu: true } },
          },
          orderBy: [{ course: { period: { startDate: 'desc' } } }],
          take: 300,
        })
      : [],
    isMethodist || hasRole(user, 'ADMIN')
      ? prisma.course.findMany({
          where: {
            status: 'ON_REVIEW',
            ...(user.departmentId ? { discipline: { departmentId: user.departmentId } } : {}),
          },
          include: {
            discipline: true,
            period: { include: { academicYear: true } },
            teachers: {
              include: {
                teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
              },
            },
          },
        })
      : [],
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('gradesheets')}</h1>

      {pendingReview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Курсы на согласовании ({pendingReview.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {pendingReview.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{pickLocalized(c.discipline, 'name', locale)}</p>
                    <p className="text-xs text-fg-muted">
                      {c.discipline.code} · {c.period.academicYear.name} {c.period.name} ·{' '}
                      {c.teachers
                        .map((ct) => `${ct.teacher.user.lastNameRu} ${ct.teacher.user.firstNameRu}`)
                        .join(', ')}
                    </p>
                  </div>
                  <Link href={`/admin/courses/${c.id}/review`}>
                    <Button size="sm">Проверить</Button>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Ведомости ({sheets.length})</CardTitle></CardHeader>
        <CardBody className="p-0">
          {sheets.length === 0 ? (
            <EmptyState title="Ведомости не сформированы" />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Дисциплина</th>
                    <th>Период</th>
                    <th>Контроль</th>
                    <th>Статус</th>
                    <th>Закрыта</th>
                    <th>Кем</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.number}</td>
                      <td className="whitespace-normal">
                        {s.course.discipline.code} —{' '}
                        {pickLocalized(s.course.discipline, 'name', locale)}
                      </td>
                      <td className="text-fg-muted">
                        {s.course.period.academicYear.name} {s.course.period.name}
                      </td>
                      <td>{s.controlPeriod}</td>
                      <td>
                        <Badge tone={s.status === 'CLOSED' ? 'success' : 'neutral'}>
                          {s.status === 'CLOSED' ? tg('sheetClosed') : 'черновик'}
                        </Badge>
                      </td>
                      <td className="text-fg-muted">{fmtDateTime(s.closedAt, locale)}</td>
                      <td className="text-fg-muted">
                        {s.closedBy ? `${s.closedBy.lastNameRu} ${s.closedBy.firstNameRu}` : '—'}
                      </td>
                      <td>
                        <a
                          href={`/api/export/gradesheet?courseId=${s.courseId}&control=${s.controlPeriod}`}
                          download
                        >
                          <Button size="sm" variant="ghost">XLSX</Button>
                        </a>
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
