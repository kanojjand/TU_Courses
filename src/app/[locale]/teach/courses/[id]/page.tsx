import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { checkCourseHours } from '@/server/courses';
import { requiresMethodistReview } from '@/server/settings';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { HoursIndicator } from '@/components/teacher/hours-indicator';
import { PublishPanel } from '@/components/teacher/publish-panel';
import { AnnouncementForm } from '@/components/teacher/announcement-form';
import { CopyCoursePanel } from '@/components/teacher/copy-course-panel';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Обзор курса: проверка часов, публикация, объявления, копирование. */
export default async function CourseOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { user, isAssistant } = await requireCourseTeacher(id);
  const t = await getTranslations('teacher');

  const [course, validation, needsReview, otherCourses] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        discipline: true,
        announcements: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { enrollments: true, modules: true } },
      },
    }),
    checkCourseHours(id),
    requiresMethodistReview(),
    // Курсы прошлых периодов той же дисциплины — источник для копирования
    prisma.course.findMany({
      where: {
        id: { not: id },
        disciplineId: (
          await prisma.course.findUniqueOrThrow({
            where: { id },
            select: { disciplineId: true },
          })
        ).disciplineId,
        ...(user.teacherProfileId
          ? { teachers: { some: { teacherId: user.teacherProfileId } } }
          : {}),
      },
      include: {
        period: { include: { academicYear: true } },
        _count: { select: { modules: true } },
      },
      orderBy: { period: { startDate: 'desc' } },
      take: 10,
    }),
  ]);

  const itemCount = await prisma.contentItem.count({ where: { module: { courseId: id } } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {course.status === 'REJECTED' && course.reviewComment && (
          <Alert tone="warning" title={t('rejected')}>
            {course.reviewComment}
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle>Объём курса</CardTitle></CardHeader>
          <CardBody>
            <HoursIndicator validation={validation} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Сводка</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-fg-muted">Модулей</dt>
                <dd className="text-xl font-semibold tabular-nums">{course._count.modules}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Элементов</dt>
                <dd className="text-xl font-semibold tabular-nums">{itemCount}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Зачислено</dt>
                <dd className="text-xl font-semibold tabular-nums">{course._count.enrollments}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Опубликован</dt>
                <dd className="text-sm">{fmtDateTime(course.publishedAt, locale)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {otherCourses.length > 0 && (
          <CopyCoursePanel
            targetCourseId={id}
            sources={otherCourses.map((c) => ({
              id: c.id,
              label: `${c.period.academicYear.name} · ${c.period.name} (${c._count.modules} модулей)`,
            }))}
          />
        )}

        <Card>
          <CardHeader><CardTitle>{t('announcement')}</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <AnnouncementForm courseId={id} />
            {course.announcements.length > 0 && (
              <ul className="space-y-3 border-t border-border pt-4 text-sm">
                {course.announcements.map((a) => (
                  <li key={a.id}>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-fg-muted">{fmtDateTime(a.createdAt, locale)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <aside>
        <PublishPanel
          courseId={id}
          status={course.status}
          isPublic={course.isPublic}
          canPublish={!isAssistant}
          needsReview={needsReview}
          hoursValid={validation.valid}
          hoursDelta={dec(validation.delta)}
        />
      </aside>
    </div>
  );
}
