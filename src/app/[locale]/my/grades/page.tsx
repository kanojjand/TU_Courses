import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireUser } from '@/server/guards';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, gradeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { Link } from '@/i18n/routing';
import { fmtGpa, fmtScore } from '@/lib/utils';
import { studentAttendance, attendanceThreshold } from '@/server/attendance';
import { AttendanceSummary } from '@/components/student/attendance-summary';

export const dynamic = 'force-dynamic';

/** F-S-09. Журнал: баллы по мероприятиям, РК1, РК2, допуск, экзамен, итог, GPA. */
export default async function MyGradesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('grades');
  const tc = await getTranslations('common');

  if (!user.studentProfileId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState title="Профиль обучающегося не найден" />
      </div>
    );
  }

  const studentId = user.studentProfileId;

  const [enrollments, gpaRecords] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId, cancelledAt: null, course: { status: { in: ['PUBLISHED', 'ARCHIVED'] } } },
      include: {
        course: {
          include: {
            discipline: true,
            period: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
            periodGrades: { where: { studentId } },
            gradeItems: {
              orderBy: [{ controlPeriod: 'asc' }, { orderIndex: 'asc' }],
              include: { grades: { where: { studentId } } },
            },
          },
        },
      },
      orderBy: { course: { period: { startDate: 'desc' } } },
    }),
    prisma.gpaRecord.findMany({ where: { studentId } }),
  ]);

  // F-LRN-06: посещаемость показывается рядом с оценками — студент смотрит
  // на успеваемость целиком, а не отдельными разделами
  const [attendance, threshold] = await Promise.all([
    studentAttendance(studentId),
    attendanceThreshold(),
  ]);

  const cumulative = gpaRecords.find((r) => r.scope === 'CUMULATIVE');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('gpa')} · Журнал</h1>
        <Link href="/my/transcript" className="text-sm text-brand hover:underline">
          Транскрипт →
        </Link>
      </div>

      <Card className="mt-5">
        <CardBody className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <div>
            <p className="text-xs text-fg-muted">Накопительный GPA</p>
            <p className="text-3xl font-bold tabular-nums">
              {fmtGpa(cumulative ? dec(cumulative.gpa) : null, locale)}
            </p>
          </div>
          <div>
            <p className="text-xs text-fg-muted">Освоено кредитов</p>
            <p className="text-3xl font-bold tabular-nums">{cumulative?.credits ?? 0}</p>
          </div>
        </CardBody>
      </Card>

      <div className="mt-5">
        <AttendanceSummary
          threshold={threshold}
          rows={attendance.map((a) => ({
            courseId: a.course.id,
            disciplineCode: a.course.discipline.code,
            disciplineName: pickLocalized(a.course.discipline, 'name', locale),
            periodName: a.course.period.name,
            total: a.summary.total,
            unmarked: a.summary.unmarked,
            present: a.summary.present,
            absent: a.summary.absent,
            late: a.summary.late,
            excused: a.summary.excused,
            online: a.summary.online,
            percent: a.summary.percent,
            // Последние шесть занятий: за какое именно занятие стоит пропуск
            recent: a.sessions.slice(-6).map((s) => ({
              heldOn: s.heldOn.toISOString().slice(0, 10),
              state: s.marks[0]?.state ?? null,
              reason: s.marks[0]?.reason ?? null,
            })),
          }))}
        />
      </div>

      {enrollments.length === 0 ? (
        <EmptyState title={tc('empty')} />
      ) : (
        <div className="mt-8 space-y-6">
          {enrollments.map((e) => {
            const g = e.course.periodGrades[0];
            const periodGpa = gpaRecords.find(
              (r) => r.scope === 'PERIOD' && r.scopeId === e.course.period.id
            );

            return (
              <Card key={e.id}>
                <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>{pickLocalized(e.course.discipline, 'name', locale)}</CardTitle>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {e.course.discipline.code} · {e.course.discipline.credits} кр. ·{' '}
                      {e.course.period.academicYear.name} {e.course.period.name}
                      {periodGpa && ` · GPA периода ${fmtGpa(dec(periodGpa.gpa), locale)}`}
                    </p>
                  </div>
                  {g?.letter && (
                    <Badge tone={gradeTone(g.letter)}>
                      {g.letter} · {fmtScore(decOrNull(g.gpaPoints), locale)}
                    </Badge>
                  )}
                </CardHeader>

                <CardBody className="space-y-4">
                  {e.course.gradeItems.length > 0 && (
                    <div className="scroll-x">
                      <table className="table-dense">
                        <thead>
                          <tr>
                            <th>Оценочное мероприятие</th>
                            <th>Период</th>
                            <th className="text-right">Балл</th>
                            <th className="text-right">Максимум</th>
                            <th className="text-right">Вес, %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.course.gradeItems.map((item) => (
                            <tr key={item.id}>
                              <td className="whitespace-normal">{item.title}</td>
                              <td>{item.controlPeriod}</td>
                              <td className="text-right tabular-nums">
                                {fmtScore(decOrNull(item.grades[0]?.score), locale)}
                              </td>
                              <td className="text-right tabular-nums text-fg-muted">
                                {fmtScore(dec(item.maxScore), locale)}
                              </td>
                              <td className="text-right tabular-nums text-fg-muted">
                                {fmtScore(dec(item.weight), locale)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <dl className="grid gap-4 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <dt className="text-xs text-fg-muted">{t('rk1')}</dt>
                      <dd className="font-semibold tabular-nums">{fmtScore(decOrNull(g?.rk1), locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t('rk2')}</dt>
                      <dd className="font-semibold tabular-nums">{fmtScore(decOrNull(g?.rk2), locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t('admission')}</dt>
                      <dd className="font-semibold tabular-nums">
                        {fmtScore(decOrNull(g?.admissionScore), locale)}
                        {g && (
                          <Badge tone={g.isAdmitted ? 'success' : 'danger'} className="ml-2">
                            {g.isAdmitted ? t('admitted') : t('notAdmitted')}
                          </Badge>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t('exam')}</dt>
                      <dd className="font-semibold tabular-nums">{fmtScore(decOrNull(g?.examScore), locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t('final')}</dt>
                      <dd className="font-semibold tabular-nums">{fmtScore(decOrNull(g?.finalScore), locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t('traditional')}</dt>
                      <dd className="font-semibold">{g?.traditional ?? '—'}</dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
