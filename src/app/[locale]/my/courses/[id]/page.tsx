import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Megaphone } from 'lucide-react';

import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireEnrolledStudent } from '@/server/guards';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CourseSidebar } from '@/components/student/course-sidebar';
import { HOURS_PER_CREDIT } from '@/domain/constants';
import { summarizeProgress } from '@/domain/activity';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-S-04. Страница курса: структура по модулям, прогресс, отметки о завершении. */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { studentId } = await requireEnrolledStudent(id);
  const t = await getTranslations('student');

  const course = await prisma.course.findUniqueOrThrow({
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
      announcements: { orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }], take: 5 },
      progress: { where: { studentId } },
      periodGrades: { where: { studentId } },
      modules: {
        where: { isPublished: true },
        orderBy: { orderIndex: 'asc' },
        include: {
          items: {
            where: { isPublished: true },
            orderBy: { orderIndex: 'asc' },
            include: { completions: { where: { studentId } } },
          },
        },
      },
    },
  });

  const grade = course.periodGrades[0];

  const modules = course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    weekNumber: m.weekNumber,
    items: m.items.map((i) => ({
      id: i.id,
      title: i.title,
      type: i.type,
      plannedAcademicHours: dec(i.plannedAcademicHours),
      workType: i.workType,
      completed: i.completions.length > 0,
    })),
  }));

  // Итоги считаются по фактическому составу курса, а не по строке Progress:
  // та обновляется только при активности обучающегося (recalculateCourseProgress),
  // поэтому в только что наполненном курсе показывала бы «0 из 0».
  const summary = summarizeProgress(
    course.modules.flatMap((m) =>
      m.items.map((i) => ({
        plannedAcademicHours: dec(i.plannedAcademicHours),
        completed: i.completions.length > 0,
        earnedHours: dec(i.completions[0]?.earnedHours),
      }))
    ),
    course.discipline.credits
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="brand">
            {course.discipline.credits} кр. · {course.discipline.credits * HOURS_PER_CREDIT} ч
          </Badge>
          <Badge>{course.period.name} · {course.period.academicYear.name}</Badge>
          {grade?.letter && <Badge tone="success">{grade.letter}</Badge>}
        </div>
        <h1 className="text-2xl font-bold">{pickLocalized(course.discipline, 'name', locale)}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {course.discipline.code}
          {course.teachers.length > 0 &&
            ` · ${course.teachers
              .map((ct) => `${ct.teacher.user.lastNameRu} ${ct.teacher.user.firstNameRu}`)
              .join(', ')}`}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Раздел 8.2: структура курса всегда видна */}
        <CourseSidebar courseId={id} modules={modules} />

        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-4">
              <Progress
                value={summary.percent}
                tone={summary.percent >= 100 ? 'success' : 'brand'}
                label={t('progressHours', {
                  earned: Math.round(summary.earnedHours),
                  total: Math.round(summary.totalHours),
                })}
              />
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-fg-muted">Элементы</p>
                  <p className="font-medium">
                    {t('progressItems', {
                      done: summary.completedItems,
                      total: summary.totalItems,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Академические часы</p>
                  <p className="font-medium tabular-nums">
                    {Math.round(summary.earnedHours)} / {Math.round(summary.totalHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-muted">Кредиты</p>
                  <p className="font-medium">
                    {t('creditsOnCompletion', { credits: course.discipline.credits })}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {course.announcements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone size={16} aria-hidden /> Объявления
                </CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="space-y-4 text-sm">
                  {course.announcements.map((a) => (
                    <li key={a.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="font-medium">
                        {a.isPinned && <span className="mr-1 text-brand">📌</span>}
                        {a.title}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-fg-muted">{a.body}</p>
                      <p className="mt-1 text-xs text-fg-muted">{fmtDateTime(a.createdAt, locale)}</p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {course.syllabus && (
            <Card>
              <CardHeader><CardTitle>Силлабус</CardTitle></CardHeader>
              <CardBody className="space-y-4 text-sm">
                {course.syllabus.goals && (
                  <div>
                    <p className="mb-1 font-medium">Цели дисциплины</p>
                    <p className="whitespace-pre-line text-fg-muted">{course.syllabus.goals}</p>
                  </div>
                )}
                {course.syllabus.gradingCriteria && (
                  <div>
                    <p className="mb-1 font-medium">Критерии оценивания</p>
                    <p className="whitespace-pre-line text-fg-muted">
                      {course.syllabus.gradingCriteria}
                    </p>
                  </div>
                )}
                {course.syllabus.policy && (
                  <div>
                    <p className="mb-1 font-medium">Политика курса</p>
                    <p className="whitespace-pre-line text-fg-muted">{course.syllabus.policy}</p>
                  </div>
                )}
                {course.syllabus.literature && (
                  <div>
                    <p className="mb-1 font-medium">Литература</p>
                    <p className="whitespace-pre-line text-fg-muted">{course.syllabus.literature}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
