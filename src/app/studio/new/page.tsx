import { getLocale, getTranslations } from 'next-intl/server';
import { NewCourseForm } from '@/components/studio/new-course-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { authorCourses, authorDisciplines, templates } from '@/lib/studio';

export default async function NewCourse() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [discs, tpls, mine] = await Promise.all([authorDisciplines(user), templates(), authorCourses(user)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('studio.create.title')} back={{ href: '/studio', label: t('studio.title') }} />
      <Card className="p-5 sm:p-6">
        <NewCourseForm
          disciplines={discs.map((d) => ({ id: d.id, label: `${d.code} · ${pickName(d, locale)}`, name: pickName(d, locale) }))}
          templates={tpls.map((c) => ({ id: c.id, label: c.title }))}
          myCourses={mine.filter((m) => !m.course.isTemplate).map((m) => ({ id: m.course.id, label: `${m.course.title} (${m.course.language.toUpperCase()})` }))}
          defaultLanguage={locale === 'kk' ? 'kk' : locale === 'en' ? 'en' : 'ru'}
        />
      </Card>
    </div>
  );
}
