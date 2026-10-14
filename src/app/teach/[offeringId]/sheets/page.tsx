import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SheetsTable } from '@/components/teach/sheets-table';
import { requireUser } from '@/lib/auth';
import { offeringAccess } from '@/lib/teacher';

export default async function OfferingSheets({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const acc = await offeringAccess(user, offeringId);
  if (!acc) notFound();
  const t = await getTranslations('teach.sheets');
  return (
    <div>
      <p className="mb-4 text-fg-muted">{t('subtitle')}</p>
      <SheetsTable offerings={[{ id: acc.offering.id, stream: acc.offering.stream, discipline: acc.discipline }]} canConfirm={acc.canEdit} />
    </div>
  );
}
