import { eq } from 'drizzle-orm';
import { getLocale, getTranslations } from 'next-intl/server';
import { CourseSettings } from '@/components/studio/course-settings';
import { Card } from '@/components/ui/card';
import { db } from '@/db';
import { courseAuthors, courses, users } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { authorDisciplines } from '@/lib/studio';
import { fullName } from '@/lib/utils';

export default async function SettingsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [[c], discs, authors] = await Promise.all([
    db.select().from(courses).where(eq(courses.id, courseId)),
    authorDisciplines(user),
    db.select({ u: users }).from(courseAuthors).innerJoin(users, eq(users.id, courseAuthors.userId)).where(eq(courseAuthors.courseId, courseId)),
  ]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="p-5">
        <CourseSettings
          courseId={courseId}
          initial={{ title: c.title, description: c.description, language: c.language, disciplineId: c.disciplineId }}
          disciplines={discs.map((d) => ({ id: d.id, label: `${d.code} · ${pickName(d, locale)}` }))}
        />
      </Card>
      <Card className="h-fit p-5">
        <p className="mb-2 font-semibold">{t('studio.settings.authors')}</p>
        <ul className="space-y-1 text-sm">
          {authors.map((a) => (
            <li key={a.u.id}>{fullName(a.u)}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
