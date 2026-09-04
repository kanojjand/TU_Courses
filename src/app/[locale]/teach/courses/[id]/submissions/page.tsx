import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { SubmissionQueue } from '@/components/teacher/submission-queue';

export const dynamic = 'force-dynamic';

/** F-T-11. Проверка сданных работ: очередь непроверенного. */
export default async function SubmissionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const submissions = await prisma.submission.findMany({
    where: {
      assignment: { contentItem: { module: { courseId: id } } },
      status: { in: ['SUBMITTED', 'GRADED', 'RETURNED'] },
    },
    orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
    include: {
      attachments: true,
      assignment: {
        include: { contentItem: { select: { title: true } } },
      },
      student: {
        include: {
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
        },
      },
    },
  });

  return (
    <SubmissionQueue
      locale={locale}
      submissions={submissions.map((s) => ({
        id: s.id,
        status: s.status,
        studentName: `${s.student.user.lastNameRu} ${s.student.user.firstNameRu}`,
        group: s.student.group?.name ?? '',
        assignmentTitle: s.assignment.contentItem.title,
        maxScore: dec(s.assignment.maxScore),
        submittedAt: s.submittedAt?.toISOString() ?? null,
        isLate: s.isLate,
        daysLate: s.daysLate,
        latePenaltyPerDay: dec(s.assignment.latePenaltyPerDay),
        latePenaltyMax: dec(s.assignment.latePenaltyMax),
        comment: s.comment,
        rawScore: s.rawScore ? dec(s.rawScore) : null,
        score: s.score ? dec(s.score) : null,
        feedback: s.feedback,
        files: s.attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          sizeBytes: Number(a.sizeBytes),
        })),
      }))}
    />
  );
}
