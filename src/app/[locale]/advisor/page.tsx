import { setRequestLocale, getTranslations } from 'next-intl/server';
import { GraduationCap, Users } from 'lucide-react';

import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requirePageAccess } from '@/server/guards';
import { summarizeProgress } from '@/domain/activity';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/alert';
import { fmtDateTime, fmtGpa } from '@/lib/utils';
import { iepQueue } from '@/server/iep';
import { IepQueue } from '@/components/advisor/iep-queue';

export const dynamic = 'force-dynamic';

/**
 * Рабочее место эдвайзера: закреплённые обучающиеся и их успеваемость.
 *
 * Право progress:view_advisees существовало в матрице доступа с самого начала,
 * но интерфейса под него не было — эдвайзер попадал в кабинет обучающегося,
 * где его встречало «Кабинет обучающегося недоступен», и упирался в тупик.
 *
 * Оценки доступны только на просмотр: изменять их эдвайзер не вправе.
 */
export default async function AdvisorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePageAccess(locale, 'progress:view_advisees');
  const t = await getTranslations('grades');

  // Закрепление идёт на профиль преподавателя, а не на пользователя.
  const advisees = user.teacherProfileId
    ? await prisma.studentProfile.findMany({
        where: { advisorId: user.teacherProfileId },
        include: {
          user: { select: { lastNameRu: true, firstNameRu: true, email: true, lastLoginAt: true } },
          group: { select: { name: true } },
          program: true,
          gpaRecords: { where: { scope: 'CUMULATIVE' }, take: 1 },
          enrollments: {
            where: { cancelledAt: null, course: { status: 'PUBLISHED' } },
            select: { courseId: true },
          },
        },
        orderBy: [{ group: { name: 'asc' } }, { user: { lastNameRu: 'asc' } }],
      })
    : [];

  // Итоги считаются по фактическому составу курсов — строка Progress
  // появляется только после первой активности обучающегося.
  const courseIds = [...new Set(advisees.flatMap((a) => a.enrollments.map((e) => e.courseId)))];
  const studentIds = advisees.map((a) => a.id);

  const modules = courseIds.length
    ? await prisma.module.findMany({
        where: { courseId: { in: courseIds }, isPublished: true },
        select: {
          courseId: true,
          items: {
            where: { isPublished: true },
            select: {
              id: true,
              plannedAcademicHours: true,
              completions: {
                where: { studentId: { in: studentIds } },
                select: { studentId: true, earnedHours: true },
              },
            },
          },
        },
      })
    : [];

  const rows = advisees.map((a) => {
    const items = a.enrollments.flatMap((e) =>
      modules
        .filter((m) => m.courseId === e.courseId)
        .flatMap((m) =>
          m.items.map((i) => {
            const done = i.completions.find((c) => c.studentId === a.id);
            return {
              plannedAcademicHours: dec(i.plannedAcademicHours),
              completed: Boolean(done),
              earnedHours: dec(done?.earnedHours),
            };
          })
        )
    );

    return {
      profile: a,
      summary: summarizeProgress(items, 0),
      gpa: a.gpaRecords[0] ? dec(a.gpaRecords[0].gpa) : null,
    };
  });

  const withRisk = rows.filter((r) => r.summary.totalItems > 0 && r.summary.percent < 25).length;

  // F-IEP-04: ИУП закреплённых обучающихся, ожидающие согласования.
  // Отбор идёт по эдвайзеру, назначенному в самом ИУП: студент мог сменить
  // эдвайзера после отправки, и план должен остаться у того, кому отправлен.
  const ieps = await iepQueue({ advisorUserId: user.id });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Закреплённые обучающиеся</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Просмотр успеваемости подопечных. Изменение оценок выполняется преподавателем курса.
      </p>

      <div className="mt-6">
        <IepQueue
          mode="advisor"
          title="Индивидуальные учебные планы"
          rows={ieps.map((i) => ({
            id: i.id,
            status: i.status,
            totalCredits: Number(i.totalCredits),
            submittedAt: i.submittedAt?.toISOString() ?? null,
            academicYearName: i.academicYear.name,
            studentName: `${i.student.user.lastNameRu} ${i.student.user.firstNameRu}`,
            studyYear: i.student.studyYear,
            groupName: i.student.group?.name ?? null,
            programCode: i.student.program.code,
            itemCount: i._count.items,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/12 text-brand">
              <Users size={18} aria-hidden />
            </span>
            <div>
              <p className="text-xs text-fg-muted">Всего подопечных</p>
              <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/12 text-warning">
              <GraduationCap size={18} aria-hidden />
            </span>
            <div>
              <p className="text-xs text-fg-muted">Прогресс ниже 25 %</p>
              <p className="text-2xl font-bold tabular-nums">{withRisk}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Успеваемость ({rows.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="Обучающиеся не закреплены"
              description="Закрепление выполняет офис регистратора при зачислении в группу."
            />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Группа</th>
                    <th>Программа</th>
                    <th>Дисциплин</th>
                    <th>Прогресс</th>
                    <th>{t('gpa')}</th>
                    <th>Последний вход</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ profile, summary, gpa }) => (
                    <tr key={profile.id}>
                      <td>
                        <span className="font-medium">
                          {profile.user.lastNameRu} {profile.user.firstNameRu}
                        </span>
                        <span className="block text-xs text-fg-muted">{profile.user.email}</span>
                      </td>
                      <td className="whitespace-nowrap">{profile.group?.name ?? '—'}</td>
                      <td className="text-xs">{pickLocalized(profile.program, 'name', locale)}</td>
                      <td className="tabular-nums">{profile.enrollments.length}</td>
                      <td className="min-w-[160px]">
                        <Progress
                          value={summary.percent}
                          tone={
                            summary.percent >= 75
                              ? 'success'
                              : summary.percent < 25
                                ? 'warning'
                                : 'brand'
                          }
                          label={`${summary.completedItems} из ${summary.totalItems} элементов`}
                        />
                      </td>
                      <td>
                        {gpa === null ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          <Badge tone={gpa >= 3 ? 'success' : gpa >= 2 ? 'brand' : 'danger'}>
                            {fmtGpa(gpa, locale)}
                          </Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs text-fg-muted">
                        {profile.user.lastLoginAt ? fmtDateTime(profile.user.lastLoginAt, locale) : '—'}
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
