import { setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { SyllabusForm } from '@/components/teacher/syllabus-form';

export const dynamic = 'force-dynamic';

/** F-T-02. Заполнение силлабуса по утверждённому шаблону. */
export default async function SyllabusPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const [syllabus, course] = await Promise.all([
    prisma.syllabus.findUnique({ where: { courseId: id } }),
    prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        discipline: {
          select: {
            credits: true,
            learningOutcomesRu: true,
            cycle: true,
            component: true,
          },
        },
      },
    }),
  ]);

  return (
    <SyllabusForm
      courseId={id}
      credits={course.discipline.credits}
      outcomes={course.discipline.learningOutcomesRu}
      initial={{
        goals: syllabus?.goals ?? '',
        competencies: syllabus?.competencies ?? '',
        policy: syllabus?.policy ?? '',
        gradingCriteria: syllabus?.gradingCriteria ?? '',
        literature: syllabus?.literature ?? '',
        officeHours: syllabus?.officeHours ?? '',
        contactInfo: syllabus?.contactInfo ?? '',
      }}
    />
  );
}
