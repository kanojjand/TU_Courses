import { setRequestLocale, getTranslations } from 'next-intl/server';

import { requireCourseTeacher } from '@/server/guards';
import { courseAnalytics } from '@/server/courses';
import { prisma } from '@/lib/prisma';
import { questionDifficultyStats } from '@/domain/quiz';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScoreChart } from '@/components/teacher/score-chart';
import { fmtMinutes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-T-13. Аналитика курса. */
export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCourseTeacher(id);

  const t = await getTranslations('teacher');
  const [stats, questions] = await Promise.all([
    courseAnalytics(id),
    prisma.question.findMany({
      where: { bank: { courseId: id }, isActive: true },
      include: { answers: { where: { isCorrect: { not: null } }, select: { isCorrect: true } } },
      take: 100,
    }),
  ]);

  const difficulty = questions
    .map((q) => ({
      text: q.text,
      ...questionDifficultyStats(
        q.answers.map((a) => ({ isCorrect: Boolean(a.isCorrect) }))
      ),
    }))
    .filter((q) => q.total > 0)
    .sort((a, b) => a.successRate - b.successRate);

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Зачислено', value: stats.enrolled },
          { label: t('completionRate'), value: `${stats.completionRate} %` },
          { label: 'Средний прогресс', value: `${stats.avgProgress} %` },
          { label: t('avgTime'), value: fmtMinutes(stats.avgMinutes) },
        ].map((s) => (
          <Card key={s.label}>
            <CardBody>
              <dt className="text-xs text-fg-muted">{s.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{s.value}</dd>
            </CardBody>
          </Card>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('scoreDistribution')}</CardTitle></CardHeader>
          <CardBody>
            {stats.scoreDistribution.every((b) => b.count === 0) ? (
              <EmptyState title="Данных о результатах тестов пока нет" />
            ) : (
              <ScoreChart data={stats.scoreDistribution} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('noActivityStudents')}</CardTitle></CardHeader>
          <CardBody>
            {stats.studentsWithoutActivity.length === 0 ? (
              <p className="text-sm text-success">
                Все зачисленные обучающиеся приступили к освоению курса.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {stats.studentsWithoutActivity.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{s.name}</span>
                    <a href={`mailto:${s.email}`} className="text-xs text-brand hover:underline">
                      {s.email}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Статистика сложности вопросов</CardTitle></CardHeader>
        <CardBody>
          {difficulty.length === 0 ? (
            <EmptyState title="Тесты ещё не проходились" />
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Вопрос</th>
                    <th className="text-right">Ответов</th>
                    <th className="text-right">Верных</th>
                    <th className="text-right">Доля успеха</th>
                    <th>Оценка</th>
                  </tr>
                </thead>
                <tbody>
                  {difficulty.map((q, i) => (
                    <tr key={i}>
                      <td className="max-w-md whitespace-normal">{q.text}</td>
                      <td className="text-right tabular-nums">{q.total}</td>
                      <td className="text-right tabular-nums">{q.correct}</td>
                      <td className="text-right tabular-nums">{q.successRate} %</td>
                      <td>
                        <Badge
                          tone={
                            q.label === 'сложный'
                              ? 'danger'
                              : q.label === 'лёгкий'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {q.label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
