import { FileSpreadsheet } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SheetsTable } from '@/components/teach/sheets-table';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { requireUser } from '@/lib/auth';
import { teacherOfferings } from '@/lib/teacher';

export default async function TeacherSheets() {
  const user = await requireUser();
  const t = await getTranslations();
  const offs = await teacherOfferings(user.id);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('teach.sheets.title')} description={t('teach.sheets.subtitle')} />
      {offs.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet />} title={t('teach.noStreams')} />
      ) : (
        <SheetsTable offerings={offs.map((o) => ({ id: o.offering.id, stream: o.offering.stream, discipline: o.discipline }))} canConfirm />
      )}
    </div>
  );
}
