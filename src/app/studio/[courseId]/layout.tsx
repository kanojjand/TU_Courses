import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusActions } from '@/components/studio/status-actions';
import { StudioTabs } from '@/components/studio/studio-tabs';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { disciplines } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { courseAccess } from '@/lib/course';
import { currentVersionNumber, hasUnpublishedChanges } from '@/lib/studio';
import { COURSE_TONE } from '@/lib/tones';
import { isUuid } from '@/lib/utils';
import { eq } from 'drizzle-orm';

export default async function CourseStudioLayout({ children, params }: { children: React.ReactNode; params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!isUuid(courseId)) notFound();
  const user = await requireUser();
  const acc = await courseAccess(user, courseId);
  if (!acc.course || !acc.canEdit) notFound();
  const c = acc.course;
  const [t, locale, changes, versionN] = await Promise.all([getTranslations(), getLocale(), hasUnpublishedChanges(courseId, c.currentVersionId), currentVersionNumber(c.currentVersionId)]);
  const [d] = c.disciplineId ? await db.select().from(disciplines).where(eq(disciplines.id, c.disciplineId)) : [];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={c.title}
        back={{ href: '/studio', label: t('studio.title') }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={COURSE_TONE[c.status]}>{t(`statuses.course.${c.status}`)}</Badge>
            {versionN && <Badge>{t('studio.status.versionN', { n: versionN })}</Badge>}
            {changes && <Badge tone="warning">{t('studio.unpublishedChanges')}</Badge>}
            <span>{c.isTemplate ? t('studio.template') : d ? `${d.code} · ${pickName(d, locale)}` : ''}</span>
            <span>· {c.language.toUpperCase()}</span>
          </span>
        }
        actions={<StatusActions courseId={courseId} status={c.status} canEdit={acc.canEdit} canApprove={acc.canApprove} hasChanges={changes} isTemplate={c.isTemplate} />}
      />
      {c.reviewComment && <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{t('studio.reviewComment', { comment: c.reviewComment })}</p>}
      <StudioTabs courseId={courseId} />
      {children}
    </div>
  );
}
