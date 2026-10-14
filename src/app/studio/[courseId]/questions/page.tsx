import { asc, eq, inArray } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { QuestionBank } from '@/components/studio/question-bank';
import { db } from '@/db';
import { questionBanks, questionOptions, questions } from '@/db/schema';

export default async function QuestionsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const t = await getTranslations('studio.questions');
  const banks = await db.select().from(questionBanks).where(eq(questionBanks.courseId, courseId)).orderBy(asc(questionBanks.createdAt));
  const qs = banks.length ? await db.select().from(questions).where(inArray(questions.bankId, banks.map((b) => b.id))) : [];
  const opts = qs.length ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, qs.map((q) => q.id))).orderBy(asc(questionOptions.position)) : [];
  return (
    <div>
      <p className="mb-4 text-fg-muted">{t('subtitle')}</p>
      <QuestionBank
        courseId={courseId}
        banks={banks.map((b) => ({
          id: b.id,
          title: b.title,
          questions: qs
            .filter((q) => q.bankId === b.id)
            .sort((a, b2) => a.difficulty - b2.difficulty)
            .map((q) => ({
              id: q.id,
              type: q.type,
              text: q.text,
              difficulty: q.difficulty,
              answers: q.data.answers ?? [],
              options: opts.filter((o) => o.questionId === q.id).map((o) => ({ text: o.text, isCorrect: o.isCorrect, matchText: o.matchText })),
            })),
        }))}
      />
    </div>
  );
}
