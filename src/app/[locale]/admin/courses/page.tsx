import { setRequestLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requirePageAccess } from '@/server/guards';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Черновик',
  ON_REVIEW: 'На согласовании',
  REJECTED: 'Возвращён на доработку',
  APPROVED: 'Согласован',
  PUBLISHED: 'Опубликован',
  ARCHIVED: 'В архиве',
};

const STATUS_TONE: Record<string, 'brand' | 'success' | 'warning' | 'danger' | undefined> = {
  DRAFT: undefined,
  ON_REVIEW: 'warning',
  REJECTED: 'danger',
  APPROVED: 'brand',
  PUBLISHED: 'success',
  ARCHIVED: undefined,
};

/**
 * F-A-06. Согласование курсов методистом кафедры.
 *
 * Очередь на согласование и обзор состояния всех курсов кафедры. Без этой
 * страницы методист мог попасть на проверку только по прямой ссылке из
 * уведомления: маршрут /admin/courses/[id]/review существовал, а списка не было.
 */
export default async function AdminCoursesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePageAccess(locale, 'course:review', 'course:edit_any');
  const t = await getTranslations('admin');

  // Методист кафедры видит курсы своей кафедры; администратор — все.
  // У методиста без профиля преподавателя кафедра не задана — тогда
  // ограничение не применяется, иначе очередь была бы пуста всегда.
  const scope = user.departmentId ? { discipline: { departmentId: user.departmentId } } : {};

  const [pending, others] = await Promise.all([
    prisma.course.findMany({
      where: { status: 'ON_REVIEW', ...scope },
      include: {
        discipline: true,
        period: { include: { academicYear: true } },
        teachers: {
          include: {
            teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    }),
    prisma.course.findMany({
      where: { status: { not: 'ON_REVIEW' }, ...scope },
      include: {
        discipline: true,
        period: { include: { academicYear: true } },
        teachers: {
          include: {
            teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
          },
        },
        modules: { select: { id: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    }),
  ]);

  const teacherNames = (c: { teachers: { teacher: { user: { lastNameRu: string | null; firstNameRu: string | null } } }[] }) =>
    c.teachers
      .map((ct) => `${ct.teacher.user.lastNameRu ?? ''} ${ct.teacher.user.firstNameRu ?? ''}`.trim())
      .filter(Boolean)
      .join(', ') || 'преподаватель не назначен';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('courses')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Ожидают решения ({pending.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {pending.length === 0 ? (
            <EmptyState
              title="Очередь пуста"
              description="Курсы появляются здесь после того, как преподаватель отправит их на согласование из раздела «Мои курсы»."
            />
          ) : (
            <ul className="space-y-2">
              {pending.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{pickLocalized(c.discipline, 'name', locale)}</p>
                    <p className="text-xs text-fg-muted">
                      {c.discipline.code}
                      {c.streamName ? ` · ${c.streamName}` : ''} · {c.period.academicYear.name}{' '}
                      {c.period.name} · {teacherNames(c)}
                    </p>
                    {c.submittedAt && (
                      <p className="text-xs text-warning">
                        Отправлен {fmtDateTime(c.submittedAt, locale)}
                      </p>
                    )}
                  </div>
                  <Link href={`/admin/courses/${c.id}/review`}>
                    <Button size="sm">Проверить</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Остальные курсы ({others.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {others.length === 0 ? (
            <EmptyState title="Курсы не созданы" />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Дисциплина</th>
                    <th>Период</th>
                    <th>Преподаватель</th>
                    <th>Модулей</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {others.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="font-medium">
                          {pickLocalized(c.discipline, 'name', locale)}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {c.discipline.code}
                          {c.streamName ? ` · ${c.streamName}` : ''}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {c.period.academicYear.name} {c.period.name}
                      </td>
                      <td className="text-xs">{teacherNames(c)}</td>
                      <td className="tabular-nums">{c.modules.length}</td>
                      <td>
                        <Badge tone={STATUS_TONE[c.status]}>
                          {STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td>
                        <Link
                          href={`/admin/courses/${c.id}/review`}
                          className="text-sm text-brand hover:underline"
                        >
                          Открыть
                        </Link>
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
