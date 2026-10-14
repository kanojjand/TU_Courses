import { Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { StudentsTable } from '@/components/reports/students-table';
import { EmptyState, PageHeader, Stat } from '@/components/ui/page';
import { avgOf, studentStats } from '@/lib/analytics';
import { requireUser } from '@/lib/auth';
import { groupScope } from '@/lib/rbac';

export default async function AdvisorHome() {
  const user = await requireUser();
  const t = await getTranslations();
  const scope = await groupScope(user, 'advisor');
  const list = await studentStats({ groupIds: scope.all ? 'all' : scope.ids });
  if (!scope.all && !scope.ids.length) return <EmptyState icon={<Users />} title={t('reports.advisor.noGroups')} />;
  const lagging = list.filter((s) => s.lagging);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.advisor.title')} description={t('reports.advisor.subtitle')} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label={t('reports.dean.students')} value={list.length} />
        <Stat label={t('reports.dean.avgProgress')} value={`${avgOf(list.map((s) => s.avgProgress)) ?? 0}%`} />
        <Stat label={t('reports.dean.lagging')} value={lagging.length} tone={lagging.length ? 'warning' : undefined} />
      </div>
      <StudentsTable list={[...lagging, ...list.filter((s) => !s.lagging)]} cardBase="/students" fileName="my_groups" />
    </div>
  );
}
