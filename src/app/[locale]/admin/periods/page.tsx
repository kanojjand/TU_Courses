import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { PeriodsPanel } from '@/components/admin/periods-panel';

export const dynamic = 'force-dynamic';

/** F-A-01. Управление академическими периодами. */
export default async function PeriodsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'period:manage');
  const t = await getTranslations('admin');

  const [years, periods] = await Promise.all([
    prisma.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.academicPeriod.findMany({
      include: {
        academicYear: true,
        _count: { select: { courses: true } },
      },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { ordinal: 'asc' }],
    }),
  ]);

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{t('periods')}</h1>
      <PeriodsPanel
        locale={locale}
        years={years.map((y) => ({ id: y.id, name: y.name }))}
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          yearName: p.academicYear.name,
          type: p.type,
          ordinal: p.ordinal,
          status: p.status,
          isCurrent: p.isCurrent,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          registrationStart: p.registrationStart.toISOString(),
          registrationEnd: p.registrationEnd.toISOString(),
          examStart: p.examStart.toISOString(),
          examEnd: p.examEnd.toISOString(),
          courseCount: p._count.courses,
        }))}
      />
    </>
  );
}
