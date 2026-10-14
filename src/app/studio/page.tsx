import { BookOpen, Plus, Video } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { COURSE_TONE } from '@/lib/tones';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { authorCourses } from '@/lib/studio';

export default async function StudioHome() {
  const user = await requireUser();
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const list = await authorCourses(user);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('studio.title')}
        description={t('studio.subtitle')}
        actions={
          <Link href="/studio/new" className={buttonClass('primary')}>
            <Plus />
            {t('studio.newCourse')}
          </Link>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t('studio.noCourses')}
          text={t('studio.noCoursesHint')}
          action={
            <Link href="/studio/new" className={buttonClass('primary')}>
              {t('studio.newCourse')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(({ course, discipline, lessons, videos }) => (
            <Link key={course.id} href={`/studio/${course.id}`} data-card className="group rounded-xl border border-border bg-surface p-4 shadow-sm hover:border-brand/40">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 font-semibold leading-snug group-hover:text-brand">{course.title}</p>
                <Badge tone={COURSE_TONE[course.status]}>{t(`statuses.course.${course.status}`)}</Badge>
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {course.isTemplate ? t('studio.template') : discipline ? `${discipline.code} · ${pickName(discipline, locale)}` : '—'} · {course.language.toUpperCase()}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                <span>{t('studio.lessonsN', { n: lessons })}</span>
                {videos.total > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Video className="size-4" />
                    {t('studio.videosReady', { ready: videos.ready, total: videos.total })}
                  </span>
                )}
                <span>{t('studio.updated', { date: format.dateTime(course.updatedAt, { day: 'numeric', month: 'short' }) })}</span>
              </div>
              {course.reviewComment && <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t('studio.reviewComment', { comment: course.reviewComment })}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
