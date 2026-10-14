import { desc, eq, inArray } from 'drizzle-orm';
import { Video } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { RefreshVideosButton } from '@/components/studio/refresh-videos';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { courseAuthors, courses, mediaAssets } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { MEDIA_TONE } from '@/lib/tones';
import { formatDuration } from '@/lib/utils';

export default async function VideosPage() {
  const user = await requireUser();
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const mine = await db.select({ c: courseAuthors.courseId }).from(courseAuthors).where(eq(courseAuthors.userId, user.id));
  const ids = mine.map((m) => m.c);
  const rows = ids.length
    ? await db
        .select({ m: mediaAssets, title: courses.title })
        .from(mediaAssets)
        .innerJoin(courses, eq(courses.id, mediaAssets.courseId))
        .where(inArray(mediaAssets.courseId, ids))
        .orderBy(desc(mediaAssets.createdAt))
    : [];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('studio.videos.title')} description={t('studio.videos.subtitle')} actions={<RefreshVideosButton />} />
      {rows.length === 0 ? (
        <EmptyState icon={<Video />} title={t('studio.videos.empty')} />
      ) : (
        <DataTable
          fileName="videos"
          columns={[
            { key: 'file', header: t('studio.videos.file') },
            { key: 'course', header: t('common.course'), filter: true },
            { key: 'status', header: t('common.status'), filter: true },
            { key: 'duration', header: t('studio.videos.duration'), align: 'right' },
            { key: 'date', header: t('common.date') },
          ]}
          rows={rows.map(({ m, title }) => ({
            id: m.id,
            cells: {
              file: m.filename ?? m.url ?? '—',
              course: title,
              status: { v: t(`statuses.media.${m.status}`), node: <Badge tone={MEDIA_TONE[m.status]}>{t(`statuses.media.${m.status}`)}</Badge> },
              duration: { v: m.durationSec, node: formatDuration(m.durationSec) || '—' },
              date: { v: m.createdAt.toISOString(), node: format.dateTime(m.createdAt, { dateStyle: 'medium' }) },
            },
          }))}
        />
      )}
    </div>
  );
}
