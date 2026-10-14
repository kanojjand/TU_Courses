import { notFound } from 'next/navigation';
import { JournalView } from '@/components/teach/journal-view';
import { requireUser } from '@/lib/auth';
import { offeringAccess } from '@/lib/teacher';

export default async function JournalPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const acc = await offeringAccess(user, offeringId);
  if (!acc) notFound();
  return <JournalView offeringId={offeringId} canEdit={acc.canEdit} disciplineName={acc.discipline} stream={acc.offering.stream} />;
}
