import { setRequestLocale } from 'next-intl/server';

import { prisma, dec } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { QuestionBankPanel } from '@/components/teacher/question-bank';

export const dynamic = 'force-dynamic';

/** F-T-08. Банк вопросов курса. */
export default async function QuestionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const bank = await prisma.questionBank.findUnique({
    where: { courseId: id },
    include: {
      topics: { orderBy: { name: 'asc' } },
      questions: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        include: { options: { orderBy: { orderIndex: 'asc' } }, topic: true },
      },
    },
  });

  return (
    <QuestionBankPanel
      courseId={id}
      topics={bank?.topics.map((t) => t.name) ?? []}
      questions={
        bank?.questions.map((q) => ({
          id: q.id,
          type: q.type as string,
          difficulty: q.difficulty as string,
          text: q.text,
          topic: q.topic?.name ?? null,
          points: dec(q.defaultPoints),
          optionCount: q.options.length,
          correctCount: q.options.filter((o) => o.isCorrect).length,
        })) ?? []
      }
    />
  );
}
