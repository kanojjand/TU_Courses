import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { JournalView } from '@/components/teach/journal-view';
import { StreamProgress } from '@/components/teach/stream-progress';
import { PageHeader, Tabs } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { offeringAccess } from '@/lib/teacher';
import { isUuid } from '@/lib/utils';

/** Журнал и прогресс потока только для просмотра: кафедра, деканат, офисы */
export default async function StreamView({ params, searchParams }: { params: Promise<{ offeringId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { offeringId } = await params;
  const { tab } = await searchParams;
  if (!isUuid(offeringId)) notFound();
  const user = await requireUser();
  const acc = await offeringAccess(user, offeringId);
  if (!acc) notFound();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const base = `/streams/${offeringId}`;
  return (
    <div className="mx-auto max-w-[80rem]">
      <PageHeader title={pickName(acc.discipline, locale)} description={`${t(`enums.lessonType.${acc.offering.lessonType}`)} · ${acc.offering.stream} · ${acc.period.code}`} />
      <Tabs
        active={tab === 'progress' ? `${base}?tab=progress` : base}
        items={[
          { href: base, label: t('teach.tabs.journal') },
          { href: `${base}?tab=progress`, label: t('teach.tabs.students') },
        ]}
      />
      {tab === 'progress' ? <StreamProgress offeringId={offeringId} /> : <JournalView offeringId={offeringId} canEdit={false} disciplineName={acc.discipline} stream={acc.offering.stream} />}
    </div>
  );
}
