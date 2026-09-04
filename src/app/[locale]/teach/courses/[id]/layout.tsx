import type { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireCourseTeacher } from '@/server/guards';
import { CourseTabs } from '@/components/teacher/course-tabs';
import { Badge } from '@/components/ui/badge';
import { HOURS_PER_CREDIT } from '@/domain/constants';

export const dynamic = 'force-dynamic';

export default async function TeachCourseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const t = await getTranslations('teacher');
  const course = await prisma.course.findUniqueOrThrow({
    where: { id },
    include: {
      discipline: true,
      period: { include: { academicYear: true } },
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="brand">
            {course.discipline.credits} кр. · {course.discipline.credits * HOURS_PER_CREDIT} ч
          </Badge>
          <Badge>{course.period.academicYear.name} · {course.period.name}</Badge>
          <Badge tone={course.status === 'PUBLISHED' ? 'success' : 'neutral'}>
            {course.status === 'PUBLISHED'
              ? t('published')
              : course.status === 'ON_REVIEW'
                ? t('onReview')
                : course.status === 'REJECTED'
                  ? t('rejected')
                  : t('draft')}
          </Badge>
        </div>
        <h1 className="text-xl font-bold sm:text-2xl">
          {pickLocalized(course.discipline, 'name', locale)}
        </h1>
        <p className="mt-0.5 text-sm text-fg-muted">{course.discipline.code}</p>
      </header>

      <CourseTabs courseId={id} />

      <div className="mt-6">{children}</div>
    </div>
  );
}
