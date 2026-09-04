import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { prisma, dec } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { requireEnrolledStudent } from '@/server/guards';
import { getActivityParams } from '@/server/settings';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { CourseSidebar } from '@/components/student/course-sidebar';
import { ActivityTracker } from '@/components/student/activity-tracker';
import { VideoPlayer } from '@/components/student/video-player';
import { FileViewer } from '@/components/student/file-viewer';
import { AssignmentPanel } from '@/components/student/assignment-panel';
import { workTypeLabel, type WorkTypeCode } from '@/domain/hours';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-S-04…F-S-08. Просмотр элемента содержания курса. */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; itemId: string }>;
}) {
  const { locale, id, itemId } = await params;
  setRequestLocale(locale);

  const { studentId } = await requireEnrolledStudent(id);
  const t = await getTranslations('student');
  const activityParams = await getActivityParams();

  const item = await prisma.contentItem.findFirst({
    where: { id: itemId, isPublished: true, module: { courseId: id } },
    include: {
      attachments: true,
      completions: { where: { studentId } },
      quiz: {
        include: {
          attempts: { where: { studentId }, orderBy: { attemptNo: 'desc' } },
          _count: { select: { questions: true } },
        },
      },
      assignment: {
        include: {
          submissions: {
            where: { studentId },
            include: { attachments: true },
          },
        },
      },
      module: {
        select: {
          title: true,
          course: {
            select: {
              id: true,
              preventDownload: true,
              discipline: { select: { nameKk: true, nameRu: true, nameEn: true } },
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
          },
        },
      },
    },
  });

  if (!item) notFound();

  const now = new Date();
  if (item.availableFrom && item.availableFrom > now) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert tone="warning" title="Элемент ещё недоступен">
          Материал откроется {fmtDateTime(item.availableFrom, locale)}.
        </Alert>
      </div>
    );
  }

  const modules = item.module.course.modules.map((m) => ({
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

  const flat = modules.flatMap((m) => m.items);
  const index = flat.findIndex((i) => i.id === itemId);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;

  const completed = item.completions.length > 0;
  const bestAttempt = item.quiz?.attempts.find((a) => a.status === 'GRADED');
  const submission = item.assignment?.submissions[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav aria-label="Хлебные крошки" className="mb-4 text-sm text-fg-muted">
        <Link href={`/my/courses/${id}`} className="hover:text-fg">
          {pickLocalized(item.module.course.discipline, 'name', locale)}
        </Link>
        <span aria-hidden> / </span>
        <span>{item.module.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <CourseSidebar courseId={id} modules={modules} />

        <article className="min-w-0">
          <header className="mb-5">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge tone="brand">
                {workTypeLabel(item.workType as WorkTypeCode)} · {dec(item.plannedAcademicHours)} ч
              </Badge>
              {completed && <Badge tone="success">{t('completed')}</Badge>}
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">{item.title}</h1>
            {item.description && (
              <p className="mt-2 max-w-prose text-sm text-fg-muted">{item.description}</p>
            )}
          </header>

          {/* Учёт активности: сигнал раз в 30 с при взаимодействии со страницей */}
          <ActivityTracker
            contentItemId={item.id}
            heartbeatIntervalSec={activityParams.heartbeatIntervalSec}
            idleTimeoutMin={activityParams.idleTimeoutMin}
            initiallyCompleted={completed}
          />

          {item.type === 'TEXT' && item.contentHtml && (
            <div
              className="prose-lesson"
              // Содержимое создаётся преподавателем через редактор Tiptap;
              // очистка выполняется на входе в редакторе и при сохранении
              dangerouslySetInnerHTML={{ __html: item.contentHtml }}
            />
          )}

          {item.type === 'VIDEO' && item.videoId && item.videoProvider && (
            <VideoPlayer
              provider={item.videoProvider as 'youtube' | 'vimeo'}
              videoId={item.videoId}
              contentItemId={item.id}
              completionThreshold={item.completionThreshold}
            />
          )}

          {(item.type === 'FILE' || item.attachments.length > 0) && (
            <FileViewer
              attachments={item.attachments.map((a) => ({
                id: a.id,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: Number(a.sizeBytes),
              }))}
              preventDownload={item.module.course.preventDownload}
            />
          )}

          {item.type === 'LINK' && item.externalUrl && (
            <Card>
              <CardBody>
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  {item.externalUrl}
                </a>
              </CardBody>
            </Card>
          )}

          {item.type === 'QUIZ' && item.quiz && (
            <Card>
              <CardBody className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-fg-muted">Вопросов</dt>
                    <dd className="font-medium">{item.quiz._count.questions}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Ограничение по времени</dt>
                    <dd className="font-medium">
                      {item.quiz.timeLimitMin ? `${item.quiz.timeLimitMin} мин` : 'нет'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">Проходной балл</dt>
                    <dd className="font-medium">{item.quiz.passingScore} %</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-muted">{t('attemptsLeft', { n: '' })}</dt>
                    <dd className="font-medium">
                      {Math.max(0, item.quiz.maxAttempts - item.quiz.attempts.length)} из{' '}
                      {item.quiz.maxAttempts}
                    </dd>
                  </div>
                </dl>

                {bestAttempt && (
                  <Alert tone={dec(bestAttempt.percent) >= item.quiz.passingScore ? 'success' : 'warning'}>
                    {t('quizResult')}: {dec(bestAttempt.score)} из {dec(bestAttempt.maxScore)} (
                    {dec(bestAttempt.percent)} %)
                  </Alert>
                )}

                {item.quiz.attempts.length < item.quiz.maxAttempts ? (
                  <Link href={`/my/courses/${id}/quiz/${item.quiz.id}`}>
                    <Button>
                      {item.quiz.attempts.some((a) => a.status === 'IN_PROGRESS')
                        ? t('continueQuiz')
                        : t('startQuiz')}
                    </Button>
                  </Link>
                ) : (
                  <p className="text-sm text-fg-muted">Число попыток исчерпано.</p>
                )}
              </CardBody>
            </Card>
          )}

          {item.type === 'ASSIGNMENT' && item.assignment && (
            <AssignmentPanel
              locale={locale}
              assignment={{
                id: item.assignment.id,
                instructions: item.assignment.instructions,
                dueAt: item.assignment.dueAt?.toISOString() ?? null,
                allowLate: item.assignment.allowLate,
                maxScore: dec(item.assignment.maxScore),
                allowedExtensions: item.assignment.allowedExtensions,
                maxFileSizeMb: item.assignment.maxFileSizeMb,
                maxFiles: item.assignment.maxFiles,
                latePenaltyPerDay: dec(item.assignment.latePenaltyPerDay),
                latePenaltyMax: dec(item.assignment.latePenaltyMax),
              }}
              submission={
                submission
                  ? {
                      id: submission.id,
                      status: submission.status,
                      submittedAt: submission.submittedAt?.toISOString() ?? null,
                      score: submission.score ? dec(submission.score) : null,
                      feedback: submission.feedback,
                      isLate: submission.isLate,
                      daysLate: submission.daysLate,
                      files: submission.attachments.map((a) => ({
                        id: a.id,
                        fileName: a.fileName,
                        sizeBytes: Number(a.sizeBytes),
                      })),
                    }
                  : null
              }
            />
          )}

          <nav className="mt-8 flex justify-between gap-3 border-t border-border pt-5">
            {prev ? (
              <Link href={`/my/courses/${id}/items/${prev.id}`}>
                <Button variant="outline">← {prev.title}</Button>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/my/courses/${id}/items/${next.id}`}>
                <Button variant="outline">{next.title} →</Button>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
