import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { OfferingTabs } from '@/components/teach/offering-tabs';
import { PageHeader } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { offeringAccess } from '@/lib/teacher';
import { isUuid } from '@/lib/utils';

export default async function OfferingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  if (!isUuid(offeringId)) notFound();
  const user = await requireUser();
  const acc = await offeringAccess(user, offeringId);
  if (!acc || !acc.canEdit) notFound();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  return (
    <div className="mx-auto max-w-[80rem]">
      <PageHeader
        title={pickName(acc.discipline, locale)}
        description={`${t(`enums.lessonType.${acc.offering.lessonType}`)} · ${acc.offering.stream} · ${acc.period.code}`}
        back={{ href: '/teach', label: t('nav.myStreams') }}
      />
      <OfferingTabs base={`/teach/${offeringId}`} />
      {children}
    </div>
  );
}
