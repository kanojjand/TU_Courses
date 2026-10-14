import { getLocale, getTranslations } from 'next-intl/server';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader, Section, Stat } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { pickName } from '@/i18n/config';
import { readinessByFaculty, universityIndicators } from '@/lib/indicators';

export default async function AcademicHome() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [ind, byFaculty] = await Promise.all([universityIndicators(), readinessByFaculty()]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.academic.title')} description={t('reports.academic.subtitle')} />
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('reports.academic.ind.disciplines')} value={ind.disciplines} />
        <Stat label={t('reports.academic.ind.withCourse')} value={ind.withCourse} tone="success" />
        <Stat label={t('reports.academic.ind.courses')} value={ind.courses} />
        <Stat label={t('reports.academic.ind.coverage')} value={`${ind.coverage}%`} tone="brand" />
      </div>
      <Section title={t('reports.academic.readiness')}>
        <DataTable
          fileName="readiness_by_faculty"
          searchable={false}
          columns={[
            { key: 'faculty', header: t('common.faculty') },
            { key: 'offerings', header: t('reports.academic.offerings'), align: 'right' },
            { key: 'with', header: t('reports.academic.withCourse'), align: 'right' },
            { key: 'pct', header: t('reports.academic.readinessPct') },
          ]}
          rows={byFaculty.map((f) => {
            const pct = f.offerings ? Math.round((f.withCourse / f.offerings) * 100) : 0;
            return {
              id: f.faculty.id,
              cells: {
                faculty: pickName(f.faculty, locale),
                offerings: f.offerings,
                with: f.withCourse,
                pct: {
                  v: pct,
                  node: (
                    <span className="flex items-center gap-2">
                      <Progress value={pct} className="w-32" tone={pct >= 80 ? 'success' : pct >= 40 ? 'warning' : 'danger'} />
                      {pct}%
                    </span>
                  ),
                },
              },
            };
          })}
        />
      </Section>
    </div>
  );
}
