import { getLocale, getTranslations } from 'next-intl/server';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader, Section, Stat } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { avgOf, offeringStats, studentStats, unclosedSheets } from '@/lib/analytics';
import { requireUser } from '@/lib/auth';
import { departmentScope, facultyScope } from '@/lib/rbac';
import { groupBy, shortName } from '@/lib/utils';

export default async function DeanHome() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const fScope = await facultyScope(user, 'dean');
  const [offStats, studs] = await Promise.all([offeringStats(await departmentScope(user, 'dean')), studentStats(fScope.all ? { groupIds: 'all' } : { facultyIds: fScope.ids })]);
  const unclosed = await unclosedSheets(offStats);
  const lagging = studs.filter((s) => s.lagging);
  const byGroup = groupBy(studs, (s) => s.groupCode || '—');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.dean.title')} />
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('reports.dean.students')} value={studs.length} />
        <Stat label={t('reports.dean.avgProgress')} value={`${avgOf(studs.map((s) => s.avgProgress)) ?? 0}%`} />
        <Stat label={t('reports.dean.lagging')} value={lagging.length} tone={lagging.length ? 'warning' : undefined} href="/faculty/lagging" />
        <Stat label={t('reports.dean.unclosed')} value={unclosed.length} tone={unclosed.length ? 'danger' : undefined} href="/faculty/sheets" />
      </div>
      <Section title={t('reports.dean.byGroup')}>
        <DataTable
          fileName="faculty_groups"
          searchable={false}
          columns={[
            { key: 'group', header: t('common.group') },
            { key: 'students', header: t('reports.dean.students'), align: 'right' },
            { key: 'progress', header: t('reports.dean.avgProgress'), align: 'right' },
            { key: 'grade', header: t('reports.dept.avgGrade'), align: 'right' },
            { key: 'lagging', header: t('reports.dean.lagging'), align: 'right' },
          ]}
          rows={Object.entries(byGroup).map(([g, list]) => ({
            id: g,
            cells: {
              group: g,
              students: list.length,
              progress: { v: avgOf(list.map((s) => s.avgProgress)), node: `${avgOf(list.map((s) => s.avgProgress)) ?? '—'}%` },
              grade: avgOf(list.map((s) => s.avgGrade)),
              lagging: list.filter((s) => s.lagging).length,
            },
          }))}
        />
      </Section>
      <Section title={t('reports.dean.byDiscipline')}>
        <DataTable
          fileName="faculty_streams"
          columns={[
            { key: 'discipline', header: t('common.discipline') },
            { key: 'stream', header: t('common.stream') },
            { key: 'teacher', header: t('common.teacher'), filter: true },
            { key: 'students', header: t('common.students'), align: 'right' },
            { key: 'progress', header: t('reports.dept.avgProgress'), align: 'right' },
            { key: 'grade', header: t('reports.dept.avgGrade'), align: 'right' },
          ]}
          rows={offStats.map((s) => ({
            id: s.offering.id,
            href: `/streams/${s.offering.id}`,
            cells: {
              discipline: `${s.discipline.code} · ${pickName(s.discipline, locale)}`,
              stream: s.offering.stream,
              teacher: s.teacher ? shortName(s.teacher) : '—',
              students: s.students,
              progress: { v: s.avgProgress, node: s.avgProgress === null ? t('reports.dept.noCourse') : `${s.avgProgress}%` },
              grade: s.avgGrade,
            },
          }))}
        />
      </Section>
    </div>
  );
}
