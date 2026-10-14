import { getLocale, getTranslations } from 'next-intl/server';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { offeringStats } from '@/lib/analytics';
import { requireUser } from '@/lib/auth';
import { departmentScope } from '@/lib/rbac';
import { shortName } from '@/lib/utils';

export default async function DeptPerformance() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const stats = await offeringStats(await departmentScope(user, 'dept_head'));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.dept.performance')} />
      <DataTable
        fileName="performance"
        columns={[
          { key: 'discipline', header: t('common.discipline') },
          { key: 'stream', header: t('common.stream') },
          { key: 'type', header: t('enums.lessonType.lecture') + '/…', filter: true },
          { key: 'teacher', header: t('common.teacher'), filter: true },
          { key: 'students', header: t('common.students'), align: 'right' },
          { key: 'progress', header: t('reports.dept.avgProgress'), align: 'right' },
          { key: 'grade', header: t('reports.dept.avgGrade'), align: 'right' },
          { key: 'sheets', header: t('reports.dept.sheetsConfirmed'), align: 'right' },
        ]}
        rows={stats.map((s) => ({
          id: s.offering.id,
          href: `/streams/${s.offering.id}`,
          tone: s.avgProgress !== null && s.avgProgress < 30 ? 'warning' : undefined,
          cells: {
            discipline: `${s.discipline.code} · ${pickName(s.discipline, locale)}`,
            stream: s.offering.stream,
            type: t(`enums.lessonType.${s.offering.lessonType}`),
            teacher: s.teacher ? shortName(s.teacher) : '—',
            students: s.students,
            progress: { v: s.avgProgress, node: s.avgProgress === null ? t('reports.dept.noCourse') : `${s.avgProgress}%` },
            grade: s.avgGrade,
            sheets: s.confirmedSheets,
          },
        }))}
      />
    </div>
  );
}
