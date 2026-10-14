import { getTranslations } from 'next-intl/server';
import { CourseImporter } from '@/components/studio/course-importer';
import { bunnyConfig } from '@/lib/bunny';

export default async function ImportPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const [t, bunny] = await Promise.all([getTranslations('studio.import'), bunnyConfig()]);
  return (
    <div>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="mb-5 text-fg-muted">{t('subtitle')}</p>
      <CourseImporter courseId={courseId} bunny={!!bunny} />
    </div>
  );
}
