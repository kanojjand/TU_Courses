import { eq, inArray } from 'drizzle-orm';
import { FileText } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { GradeSubmissionForm } from '@/components/teach/grade-submission-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { assignments, disciplines, files, lessonBlocks, offerings, submissions, users } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { teacherReviewQueue } from '@/lib/teacher';
import { formatBytes, fullName, isUuid } from '@/lib/utils';

export default async function GradeSubmission({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  if (!isUuid(submissionId)) notFound();
  const user = await requireUser();
  const [row] = await db
    .select({ sub: submissions, as: assignments, block: lessonBlocks, off: offerings, student: users, discipline: disciplines })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(lessonBlocks, eq(lessonBlocks.id, assignments.blockId))
    .innerJoin(offerings, eq(offerings.id, submissions.offeringId))
    .innerJoin(disciplines, eq(disciplines.id, offerings.disciplineId))
    .innerJoin(users, eq(users.id, submissions.studentId))
    .where(eq(submissions.id, submissionId));
  if (!row || row.off.teacherId !== user.id) notFound();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const fileRows = row.sub.fileIds.length ? await db.select().from(files).where(inArray(files.id, row.sub.fileIds)) : [];
  const queue = await teacherReviewQueue(user.id, false);
  const next = queue.find((q) => q.submission.id !== submissionId);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={fullName(row.student)}
        description={`${row.block.title} · ${pickName(row.discipline, locale)} · ${row.off.stream}`}
        back={{ href: '/teach/review', label: t('teach.review.title') }}
      />
      <Card className="mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          {t('teach.review.submittedAt')}: {format.dateTime(row.sub.submittedAt, { dateStyle: 'medium', timeStyle: 'short' })}
          {row.sub.isLate && <Badge tone="danger">{t('common.late')}</Badge>}
        </div>
        {row.as.instructions && <p className="mb-4 rounded-lg bg-surface-2/70 p-3 text-sm whitespace-pre-wrap">{row.as.instructions}</p>}
        {row.sub.text && (
          <>
            <p className="mb-1 font-medium">{t('teach.review.studentText')}</p>
            <p className="mb-4 whitespace-pre-wrap">{row.sub.text}</p>
          </>
        )}
        <p className="mb-1 font-medium">{t('teach.review.files')}</p>
        {fileRows.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('teach.review.noFiles')}</p>
        ) : (
          <ul className="space-y-1.5">
            {fileRows.map((f) => (
              <li key={f.id}>
                <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand hover:underline">
                  <FileText className="size-4" />
                  {f.filename} <span className="text-sm text-fg-muted">({formatBytes(f.size)})</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {row.as.criteria && (
          <div className="mt-4 rounded-lg border border-border p-3 text-sm">
            <p className="mb-1 font-medium">{t('learn.assignment.criteria')}</p>
            <p className="whitespace-pre-wrap text-fg-muted">{row.as.criteria}</p>
          </div>
        )}
      </Card>
      <Card className="p-5">
        {row.sub.isLate && <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t('teach.review.lateNote')}</p>}
        <GradeSubmissionForm
          submissionId={submissionId}
          maxScore={row.as.maxScore}
          initialScore={row.sub.score !== null ? Math.round((row.sub.score / 100) * row.as.maxScore * 10) / 10 : null}
          initialFeedback={row.sub.feedback ?? ''}
          nextHref={next ? `/teach/review/${next.submission.id}` : '/teach/review'}
        />
      </Card>
    </div>
  );
}
