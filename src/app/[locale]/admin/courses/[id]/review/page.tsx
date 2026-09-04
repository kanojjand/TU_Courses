import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requirePageAccess } from '@/server/guards';
import { checkCourseHours } from '@/server/courses';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { HoursIndicator } from '@/components/teacher/hours-indicator';
import { ReviewForm } from '@/components/admin/review-form';
import { Badge } from '@/components/ui/badge';
import { workTypeLabel, type WorkTypeCode } from '@/domain/hours';

export const dynamic = 'force-dynamic';

/** Согласование курса методистом кафедры (роль METHODIST, раздел 3). */
export default async function CourseReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'course:review', 'course:edit_any');

  const [course, validation] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        discipline: true,
        period: { include: { academicYear: true } },
        syllabus: true,
        teachers: {
          include: {
            teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
          },
        },
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    }),
    checkCourseHours(id),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{pickLocalized(course.discipline, 'name', locale)}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {course.discipline.code} · {course.period.academicYear.name} {course.period.name} ·{' '}
          {course.teachers
            .map((ct) => `${ct.teacher.user.lastNameRu} ${ct.teacher.user.firstNameRu}`)
            .join(', ')}
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle>Соответствие объёма</CardTitle></CardHeader>
        <CardBody>
          <HoursIndicator validation={validation} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Структура ЭУМКД</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          {course.modules.map((m, mi) => (
            <div key={m.id}>
              <p className="mb-1.5 font-medium">
                {m.weekNumber ? `Неделя ${m.weekNumber}` : `Модуль ${mi + 1}`}. {m.title}
              </p>
              <ul className="space-y-1 text-sm">
                {m.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-fg-muted">
                    <Badge>{i.type}</Badge>
                    <span className="min-w-0 flex-1">{i.title}</span>
                    <span>{workTypeLabel(i.workType as WorkTypeCode)}</span>
                    <Badge tone="brand">{dec(i.plannedAcademicHours)} ч</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>

      {course.syllabus && (
        <Card>
          <CardHeader><CardTitle>Силлабус</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            {(
              [
                ['Цели', course.syllabus.goals],
                ['Компетенции', course.syllabus.competencies],
                ['Критерии оценивания', course.syllabus.gradingCriteria],
                ['Политика курса', course.syllabus.policy],
                ['Литература', course.syllabus.literature],
              ] as const
            ).map(([label, value]) =>
              value ? (
                <div key={label}>
                  <p className="font-medium">{label}</p>
                  <p className="whitespace-pre-line text-fg-muted">{value}</p>
                </div>
              ) : (
                <p key={label} className="text-warning">
                  {label}: не заполнено
                </p>
              )
            )}
          </CardBody>
        </Card>
      )}

      <ReviewForm courseId={id} hoursValid={validation.valid} />
    </div>
  );
}
