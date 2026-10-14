import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, ExternalLink, FileDown, FileText, ListTree, Timer, Trophy } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AssignmentPanel } from '@/components/learn/assignment-panel';
import { LessonVisit } from '@/components/learn/lesson-visit';
import { CourseOutline } from '@/components/learn/outline';
import { VideoPlayer } from '@/components/learn/video-player';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireUser } from '@/lib/auth';
import { offeringSnapshot } from '@/lib/course';
import { lessonPageData, studentPublicId } from '@/lib/lesson';
import { schemeForOffering, studentCourseProgress } from '@/lib/progress';
import { cleanHtml } from '@/lib/sanitize';
import { studentOffering } from '@/lib/student';
import { formatBytes, isUuid, shortName } from '@/lib/utils';

export default async function LessonPage({ params }: { params: Promise<{ offeringId: string; lessonId: string }> }) {
  const { offeringId, lessonId } = await params;
  if (!isUuid(offeringId) || !isUuid(lessonId)) notFound();
  const user = await requireUser();
  const row = await studentOffering(user.id, offeringId);
  if (!row) notFound();
  const snapRow = await offeringSnapshot(offeringId);
  if (!snapRow) notFound();
  const { snap } = snapRow;
  const [t, format, data, progress, scheme, publicId] = await Promise.all([
    getTranslations(),
    getFormatter(),
    lessonPageData(user.id, snap, lessonId, offeringId),
    studentCourseProgress(user.id, snap),
    schemeForOffering(offeringId),
    studentPublicId(user.id, user.login),
  ]);
  if (!data) notFound();
  const { lesson, index, total, prev, next, blocks } = data;
  const done = progress.completedIds.has(lesson.id);
  const watermark = `${shortName(user)} · ${publicId}`;
  const fmt = (d: Date | null | undefined) => (d ? format.dateTime(d, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      <LessonVisit offeringId={offeringId} lessonId={lesson.id} wasDone={done} />
      <aside className="no-print hidden w-72 shrink-0 xl:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1">
          <Link href={`/learn/${offeringId}`} className="mb-3 block text-sm font-semibold hover:text-brand">
            {snap.title}
          </Link>
          <CourseOutline snap={snap} offeringId={offeringId} completed={progress.completedIds} seen={progress.seenIds} current={lesson.id} compact />
        </div>
      </aside>

      <article className="min-w-0 flex-1">
        <nav className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
          <Link href={`/learn/${offeringId}`} className="inline-flex min-h-9 items-center gap-1 hover:text-fg">
            <ArrowLeft className="size-4" />
            <span className="max-w-[16rem] truncate">{snap.title}</span>
          </Link>
          <span aria-hidden>·</span>
          <span>{t('learn.lessonOf', { n: index + 1, total })}</span>
        </nav>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[1.45rem] leading-tight font-bold tracking-tight sm:text-[1.7rem]">{lesson.title}</h1>
          {done ? (
            <Badge tone="success" className="text-sm">
              <CheckCircle2 className="size-4" />
              {t('learn.lessonDone')}
            </Badge>
          ) : lesson.estMinutes ? (
            <Badge>{t('learn.minutes', { n: lesson.estMinutes })}</Badge>
          ) : null}
        </div>

        <details className="no-print mb-5 rounded-xl border border-border bg-surface xl:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-medium">
            <ListTree className="size-5 text-fg-muted" />
            {t('learn.outline')}
            <span className="ml-auto text-sm text-fg-muted">{progress.percent}%</span>
          </summary>
          <div className="border-t border-border p-3">
            <CourseOutline snap={snap} offeringId={offeringId} completed={progress.completedIds} seen={progress.seenIds} current={lesson.id} compact />
          </div>
        </details>

        <div className="space-y-6">
          {blocks.map((b) => {
            const head = b.block.title ? (
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{b.block.title}</h2>
                {b.block.required && <Badge tone="brand">{t('learn.required')}</Badge>}
              </div>
            ) : null;

            if (b.block.type === 'video' && 'video' in b && b.video) {
              return (
                <section key={b.block.id}>
                  {head}
                  <VideoPlayer
                    blockId={b.block.id}
                    offeringId={offeringId}
                    source={b.video.source}
                    watermark={watermark}
                    initialPercent={b.video.state?.percent ?? 0}
                    lastPosition={b.video.state?.lastPosition ?? 0}
                    threshold={scheme.videoThreshold}
                    title={b.block.title}
                  />
                </section>
              );
            }
            if (b.block.type === 'text') {
              return (
                <section key={b.block.id}>
                  {head}
                  <Card className="p-5 sm:p-6">
                    <div className="prose-lesson" dangerouslySetInnerHTML={{ __html: cleanHtml(b.block.data.html ?? '') }} />
                  </Card>
                </section>
              );
            }
            if (b.block.type === 'file') {
              const f = 'file' in b ? b.file : null;
              return (
                <section key={b.block.id}>
                  {head}
                  {f ? (
                    <Card className="flex flex-wrap items-center gap-4 p-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <FileText className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{f.name}</p>
                        <p className="text-sm text-fg-muted">{formatBytes(f.size)}</p>
                      </div>
                      <div className="flex gap-2">
                        {f.mime === 'application/pdf' && (
                          <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
                            <ExternalLink />
                            {t('learn.file.open')}
                          </a>
                        )}
                        <a href={`/api/files/${f.id}?download`} className={buttonClass('primary')}>
                          <FileDown />
                          {t('learn.file.download')}
                        </a>
                      </div>
                    </Card>
                  ) : (
                    <p className="text-sm text-fg-muted">{t('learn.file.missing')}</p>
                  )}
                </section>
              );
            }
            if (b.block.type === 'link') {
              return (
                <section key={b.block.id}>
                  <a
                    href={b.block.data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-card
                    className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm hover:border-brand/40"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                      <ExternalLink className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{b.block.title || b.block.data.url}</p>
                      {b.block.data.description && <p className="text-sm text-fg-muted">{b.block.data.description}</p>}
                      <p className="truncate text-xs text-fg-muted">{b.block.data.url}</p>
                    </div>
                    <span className={buttonClass('secondary', 'md', 'hidden sm:inline-flex')}>{t('learn.link.open')}</span>
                  </a>
                </section>
              );
            }
            if (b.block.type === 'quiz') {
              const q = 'quiz' in b ? b.quiz : null;
              if (!q) return null;
              const left = q.quiz.attemptsAllowed - q.used;
              const canStart = q.decision.allowed && (q.activeAttemptId || left > 0) && q.questionCount > 0;
              return (
                <section key={b.block.id}>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <ClipboardCheck className="size-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{b.block.title}</h2>
                          {b.block.required && <Badge tone="brand">{t('learn.required')}</Badge>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                          <span>{t('learn.quiz.questions', { n: q.questionCount })}</span>
                          <span className="inline-flex items-center gap-1">
                            <Timer className="size-4" />
                            {q.quiz.timeLimitMin ? t('learn.quiz.timeLimit', { n: q.quiz.timeLimitMin }) : t('learn.quiz.noTimeLimit')}
                          </span>
                          <span>{t('learn.quiz.attempts', { used: q.used, total: q.quiz.attemptsAllowed })}</span>
                          {q.window?.dueAt && <span>{t('learn.assignment.due', { date: fmt(q.window.dueAt) })}</span>}
                        </div>
                        {q.best !== null && (
                          <p className="mt-2 inline-flex items-center gap-1.5 font-medium text-success">
                            <Trophy className="size-4" />
                            {t('learn.quiz.best', { score: q.best })}
                          </p>
                        )}
                        {q.decision.timing === 'late' && <p className="mt-2 text-sm font-medium text-warning">{t('learn.quiz.lateWarning')}</p>}
                        {q.decision.timing === 'closed' && <p className="mt-2 text-sm font-medium text-danger">{t('learn.quiz.closed')}</p>}
                        {q.decision.timing === 'not_open' && <p className="mt-2 text-sm font-medium text-fg-muted">{t('learn.quiz.notOpen', { date: fmt(q.window?.opensAt) })}</p>}
                        {q.questionCount === 0 && <p className="mt-2 text-sm text-fg-muted">{t('learn.quiz.empty')}</p>}
                      </div>
                      {canStart ? (
                        <Link href={`/learn/${offeringId}/quiz/${b.block.id}`} className={buttonClass('primary', 'lg', 'w-full sm:w-auto')}>
                          {q.activeAttemptId ? t('learn.quiz.resume') : q.used > 0 ? t('learn.quiz.retry') : t('learn.quiz.start')}
                        </Link>
                      ) : (
                        left <= 0 && !q.activeAttemptId && <Badge>{t('learn.quiz.noAttemptsLeft')}</Badge>
                      )}
                    </div>
                  </Card>
                </section>
              );
            }
            if (b.block.type === 'assignment') {
              const a = 'assignment' in b ? b.assignment : null;
              if (!a) return null;
              return (
                <section key={b.block.id}>
                  <Card className="p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{b.block.title}</h2>
                      {b.block.required && <Badge tone="brand">{t('learn.required')}</Badge>}
                      {a.window?.dueAt && <Badge tone={a.decision.timing === 'late' ? 'danger' : 'neutral'}>{t('learn.assignment.due', { date: fmt(a.window.dueAt) })}</Badge>}
                    </div>
                    {a.assignment.instructions && <p className="mb-3 leading-relaxed whitespace-pre-wrap">{a.assignment.instructions}</p>}
                    {a.assignment.criteria && (
                      <div className="mb-4 rounded-lg bg-surface-2/70 p-3 text-sm">
                        <p className="mb-1 font-medium">{t('learn.assignment.criteria')}</p>
                        <p className="whitespace-pre-wrap text-fg-muted">{a.assignment.criteria}</p>
                      </div>
                    )}
                    {a.decision.timing === 'closed' && !a.submission && <p className="text-sm font-medium text-danger">{t('learn.assignment.closed')}</p>}
                    {a.decision.timing === 'not_open' && <p className="text-sm font-medium text-fg-muted">{t('learn.assignment.notOpen', { date: fmt(a.window?.opensAt) })}</p>}
                    <AssignmentPanel
                      offeringId={offeringId}
                      blockId={b.block.id}
                      allowedExt={a.assignment.allowedExt.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)}
                      maxFiles={a.assignment.maxFiles}
                      allowed={a.decision.allowed}
                      late={a.decision.late}
                      existing={
                        a.submission
                          ? {
                              submittedAt: a.submission.submittedAt.toISOString(),
                              text: a.submission.text,
                              files: a.files,
                              score: a.submission.score,
                              feedback: a.submission.feedback,
                              isLate: a.submission.isLate,
                            }
                          : null
                      }
                    />
                  </Card>
                </section>
              );
            }
            return null;
          })}
        </div>

        <div className="no-print mt-8 grid grid-cols-2 gap-3 border-t border-border pt-5">
          {prev ? (
            <Link href={`/learn/${offeringId}/${prev.id}`} className={buttonClass('secondary', 'lg', 'justify-start')}>
              <ArrowLeft />
              <span className="truncate sm:hidden">{t('common.back')}</span>
              <span className="hidden truncate sm:inline">{t('learn.prevLesson')}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/learn/${offeringId}/${next.id}`} className={buttonClass('primary', 'lg', 'justify-end')}>
              <span className="truncate sm:hidden">{t('common.next')}</span>
              <span className="hidden truncate sm:inline">{t('learn.nextLesson')}</span>
              <ArrowRight />
            </Link>
          ) : (
            <Link href={`/learn/${offeringId}`} className={buttonClass('secondary', 'lg', 'justify-end')}>
              <span className="truncate">{t('learn.outline')}</span>
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}
