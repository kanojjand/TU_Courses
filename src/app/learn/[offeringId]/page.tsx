import { ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CourseOutline } from '@/components/learn/outline';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { offeringSnapshot, snapshotStats } from '@/lib/course';
import { studentCourseProgress } from '@/lib/progress';
import { studentOffering } from '@/lib/student';
import { fullName, isUuid } from '@/lib/utils';

export default async function CoursePage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  if (!isUuid(offeringId)) notFound();
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const row = await studentOffering(user.id, offeringId);
  if (!row) notFound();
  const snapRow = await offeringSnapshot(offeringId);
  if (!snapRow) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={pickName(row.discipline, locale)} back={{ href: '/learn', label: t('nav.myCourses') }} />
        <EmptyState icon={<Clock />} title={t('learn.courseNotReady')} text={t('learn.courseNotReadyHint')} />
      </div>
    );
  }
  const { snap } = snapRow;
  const progress = await studentCourseProgress(user.id, snap);
  const stats = snapshotStats(snap);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={snap.title} back={{ href: '/learn', label: t('nav.myCourses') }} />
      <Card className="mb-6 p-5">
        {snap.description && <p className="mb-4 text-[0.9375rem] leading-relaxed text-fg-muted">{snap.description}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg-muted">
          {row.teacher && (
            <span>
              {t('learn.teacher')}: <span className="font-medium text-fg">{fullName(row.teacher)}</span>
            </span>
          )}
          <span>{t('learn.modulesCount', { n: stats.modules })}</span>
          <span>{t('learn.lessonsDone', { done: progress.completed, total: progress.total })}</span>
        </div>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3">
            <Progress value={progress.percent} label={t('common.progress')} tone={progress.percent >= 100 ? 'success' : 'brand'} />
            <span className="text-sm font-semibold tabular-nums">{progress.percent}%</span>
          </div>
          {progress.continueLessonId && progress.percent < 100 && (
            <Link href={`/learn/${offeringId}/${progress.continueLessonId}`} className={buttonClass('primary', 'lg', 'w-full sm:w-auto')}>
              {progress.completed > 0 ? t('learn.continue') : t('learn.start')}
              <ArrowRight />
            </Link>
          )}
        </div>
        {progress.percent >= 100 && <p className="mt-3 font-medium text-success">{t('learn.courseDone')}</p>}
      </Card>
      <h2 className="mb-3 text-lg font-semibold">{t('learn.outline')}</h2>
      <CourseOutline snap={snap} offeringId={offeringId} completed={progress.completedIds} seen={progress.seenIds} />
    </div>
  );
}
