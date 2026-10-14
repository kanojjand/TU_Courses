import { getTranslations } from 'next-intl/server';
import { StudentsTable } from '@/components/reports/students-table';
import { PageHeader } from '@/components/ui/page';
import { LAGGING_GRADE, LAGGING_PROGRESS, studentStats } from '@/lib/analytics';
import { requireUser } from '@/lib/auth';
import { facultyScope } from '@/lib/rbac';

export default async function LaggingPage() {
  const user = await requireUser();
  const t = await getTranslations('reports.dean');
  const scope = await facultyScope(user, 'dean');
  const list = (await studentStats(scope.all ? { groupIds: 'all' } : { facultyIds: scope.ids })).filter((s) => s.lagging);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('laggingTitle')} description={t('laggingHint', { p: LAGGING_PROGRESS, g: LAGGING_GRADE })} />
      <StudentsTable list={list} cardBase="/students" fileName="lagging" />
    </div>
  );
}
