import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { PeriodsPanel } from '@/components/admin/periods-panel';
import { CalendarPanel } from '@/components/admin/calendar-panel';
import { checkPeriodDuration, MIN_WEEKS_BY_PERIOD } from '@/domain/iep';

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
        regWindows: { orderBy: { opensAt: 'asc' } },
        calendar: { orderBy: { startDate: 'asc' } },
      },
      orderBy: [{ academicYear: { startDate: 'desc' } }, { ordinal: 'asc' }],
    }),
  ]);

  const now = new Date();

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

      <CalendarPanel
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          yearName: p.academicYear.name,
          type: p.type,
          weeksCount: p.weeksCount,
          requiredWeeks: MIN_WEEKS_BY_PERIOD[p.type] ?? 0,
          durationIssue: checkPeriodDuration(p)?.message ?? null,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          windows: p.regWindows.map((w) => ({
            kind: w.kind,
            opensAt: w.opensAt.toISOString(),
            closesAt: w.closesAt.toISOString(),
            minCredits: w.minCredits,
            maxCredits: w.maxCredits,
            isOpen: now >= w.opensAt && now <= w.closesAt,
          })),
          events: p.calendar.map((e) => ({
            id: e.id,
            kind: e.kind,
            courseNo: e.courseNo,
            startDate: e.startDate.toISOString(),
            endDate: e.endDate.toISOString(),
            note: e.note,
          })),
        }))}
      />
    </>
  );
}
