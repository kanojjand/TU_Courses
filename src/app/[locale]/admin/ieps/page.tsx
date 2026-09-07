import { setRequestLocale } from 'next-intl/server';

import { requirePageAccess } from '@/server/guards';
import { iepQueue } from '@/server/iep';
import { IepQueue } from '@/components/advisor/iep-queue';

export const dynamic = 'force-dynamic';

/**
 * F-IEP-04, последний шаг маршрута: офис Регистратора фиксирует ИУП,
 * согласованные эдвайзерами. После фиксации ИУП становится основанием
 * для учёта кредитов и регистрации на дисциплины.
 */
export default async function AdminIepsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'iep:confirm', 'iep:view_any');

  const rows = await iepQueue({ status: ['SUBMITTED', 'APPROVED', 'CONFIRMED', 'REJECTED'] });

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Индивидуальные учебные планы</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Маршрут: студент формирует ИУП, эдвайзер согласует, офис Регистратора фиксирует.
        Регистрация на дисциплины открывается после согласования эдвайзером.
      </p>

      <IepQueue
        mode="registrar"
        title={`Планы обучающихся (${rows.length})`}
        rows={rows.map((i) => ({
          id: i.id,
          status: i.status,
          totalCredits: Number(i.totalCredits),
          submittedAt: i.submittedAt?.toISOString() ?? null,
          academicYearName: i.academicYear.name,
          studentName: `${i.student.user.lastNameRu} ${i.student.user.firstNameRu}`,
          studyYear: i.student.studyYear,
          groupName: i.student.group?.name ?? null,
          programCode: i.student.program.code,
          itemCount: i._count.items,
        }))}
      />
    </>
  );
}
