import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CoursePreview } from '@/components/studio/course-preview';
import { StatusActions } from '@/components/studio/status-actions';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page';
import { requireUser } from '@/lib/auth';
import { courseAccess, loadCourseTree } from '@/lib/course';
import { hasUnpublishedChanges } from '@/lib/studio';
import { COURSE_TONE } from '@/lib/tones';
import { isUuid } from '@/lib/utils';

export default async function CourseReview({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const { courseId } = await params;
  const { lesson } = await searchParams;
  if (!isUuid(courseId)) notFound();
  const user = await requireUser();
  const acc = await courseAccess(user, courseId);
  if (!acc.course || !acc.canApprove) notFound();
  const [t, snap, changes] = await Promise.all([getTranslations(), loadCourseTree(courseId), hasUnpublishedChanges(courseId, acc.course.currentVersionId)]);
  if (!snap) notFound();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={acc.course.title}
        back={{ href: '/department', label: t('nav.readiness') }}
        description={<Badge tone={COURSE_TONE[acc.course.status]}>{t(`statuses.course.${acc.course.status}`)}</Badge>}
        actions={<StatusActions courseId={courseId} status={acc.course.status} canEdit={false} canApprove hasChanges={changes || !acc.course.currentVersionId} isTemplate={acc.course.isTemplate} />}
      />
      <p className="mb-5 text-sm text-fg-muted">{t('studio.status.publishHint')}</p>
      <CoursePreview snap={snap} basePath={`/department/courses/${courseId}`} lessonId={lesson} />
    </div>
  );
}
