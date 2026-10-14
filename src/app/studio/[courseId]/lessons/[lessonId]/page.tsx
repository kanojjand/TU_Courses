import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LessonEditor } from '@/components/studio/lesson-editor';
import { bunnyConfig } from '@/lib/bunny';
import { banksWithCounts, lessonEditorData } from '@/lib/studio';
import { isUuid } from '@/lib/utils';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default async function LessonEditPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  if (!isUuid(lessonId)) notFound();
  const [t, data, banks, bunny] = await Promise.all([getTranslations(), lessonEditorData(courseId, lessonId), banksWithCounts(courseId), bunnyConfig()]);
  if (!data) notFound();
  return (
    <div>
      <Link href={`/studio/${courseId}`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ChevronLeft className="size-4" />
        {t('studio.lesson.back')}
      </Link>
      <h2 className="mb-1 text-xl font-bold">{data.lesson.title}</h2>
      <p className="mb-5 text-sm text-fg-muted">
        {t('common.weekN', { n: data.module.week })} · {data.module.title}
      </p>
      <LessonEditor key={lessonId} courseId={courseId} lessonId={lessonId} initial={data.blocks} banks={banks} bunny={!!bunny} />
    </div>
  );
}
