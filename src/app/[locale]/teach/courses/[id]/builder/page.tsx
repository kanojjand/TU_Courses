import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { checkCourseHours } from '@/server/courses';
import { CourseBuilder } from '@/components/teacher/course-builder';

export const dynamic = 'force-dynamic';

/** F-T-03…F-T-07. Конструктор курса. */
export default async function BuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const [course, validation] = await Promise.all([
    prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        discipline: { select: { credits: true } },
        modules: {
          orderBy: { orderIndex: 'asc' },
          include: {
            items: {
              orderBy: { orderIndex: 'asc' },
              include: {
                attachments: true,
                quiz: { select: { id: true, _count: { select: { questions: true } } } },
                assignment: { select: { id: true, dueAt: true, maxScore: true } },
              },
            },
          },
        },
      },
    }),
    checkCourseHours(id),
  ]);

  return (
    <CourseBuilder
      courseId={id}
      credits={course.discipline.credits}
      validation={validation}
      modules={course.modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        weekNumber: m.weekNumber,
        isPublished: m.isPublished,
        items: m.items.map((i) => ({
          id: i.id,
          type: i.type,
          title: i.title,
          description: i.description,
          plannedAcademicHours: dec(i.plannedAcademicHours),
          workType: i.workType,
          contentHtml: i.contentHtml,
          externalUrl: i.externalUrl,
          completionThreshold: i.completionThreshold,
          isPublished: i.isPublished,
          attachments: i.attachments.map((a) => ({
            id: a.id,
            fileName: a.fileName,
            sizeBytes: Number(a.sizeBytes),
          })),
          quizId: i.quiz?.id ?? null,
          quizQuestions: i.quiz?._count.questions ?? 0,
          assignmentId: i.assignment?.id ?? null,
        })),
      }))}
    />
  );
}
