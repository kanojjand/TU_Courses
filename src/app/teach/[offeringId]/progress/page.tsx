import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { StreamProgress } from '@/components/teach/stream-progress';
import { requireUser } from '@/lib/auth';
import { offeringAccess } from '@/lib/teacher';

export default async function ProgressPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const acc = await offeringAccess(user, offeringId);
  if (!acc) notFound();
  await Promise.all([getTranslations(), getFormatter()]);
  return <StreamProgress offeringId={offeringId} />;
}
