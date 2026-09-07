import { setRequestLocale } from 'next-intl/server';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { appealQueue, loadCreditTransfers, honoursReport, promotionThreshold } from '@/server/assessment';
import { AssessmentPanel } from '@/components/admin/assessment-panel';

export const dynamic = 'force-dynamic';

/**
 * F-ASM-04, F-ASM-09, F-ASM-10. Рабочее место офиса Регистратора:
 * апелляции, перезачёт кредитов и проверка на диплом с отличием.
 */
export default async function AppealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { locale } = await params;
  const { student: studentId } = await searchParams;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'grade:edit_after_close');

  // Запросы идут последовательно, а не через Promise.all. Приложение
  // подключается к Supabase через транзакционный пул с connection_limit=1
  // (см. src/lib/prisma.ts): параллелизма это всё равно не даёт, а очередь
  // к единственному соединению упирается в таймаут пула.
  const appeals = await appealQueue();
  const students = await prisma.studentProfile.findMany({
    where: { status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY', 'GRADUATED'] } },
    select: {
      id: true,
      user: { select: { lastNameRu: true, firstNameRu: true } },
      group: { select: { name: true } },
      program: { select: { code: true } },
    },
    orderBy: { user: { lastNameRu: 'asc' } },
    take: 200,
  });
  const threshold = await promotionThreshold();

  // Перезачёт и проверка на отличие показываются по выбранному обучающемуся:
  // это адресные операции, а не список
  const selected = studentId ?? null;
  const transfers = selected ? await loadCreditTransfers(selected) : null;
  const honours = selected ? await honoursReport(selected, locale) : null;
  const slots = selected
    ? await prisma.curriculumSlot.findMany({
        where: { curriculum: { students: { some: { id: selected } } } },
        select: { id: true, slotCode: true, cycle: true, component: true, credits: true },
        orderBy: { sortOrder: 'asc' },
        take: 200,
      })
    : [];
  const disciplines = selected
    ? await prisma.discipline.findMany({
        where: { isActive: true },
        select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
        orderBy: { code: 'asc' },
        take: 300,
      })
    : [];

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Апелляции и перезачёт</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Апелляция подаётся обучающимся в установленный срок после закрытия ведомости и
        рассматривается комиссией. Перезачёт кредитов выполняется при переводе,
        восстановлении и после академической мобильности на основании верифицируемого
        транскрипта.
      </p>

      <AssessmentPanel
        promotionThreshold={threshold}
        selectedStudentId={selected}
        students={students.map((s) => ({
          id: s.id,
          name: `${s.user.lastNameRu} ${s.user.firstNameRu}`,
          groupName: s.group?.name ?? null,
          programCode: s.program.code,
        }))}
        appeals={appeals.map((a) => ({
          id: a.id,
          status: a.status,
          reason: a.reason,
          decision: a.decision,
          filedAt: a.filedAt.toISOString(),
          studentName: `${a.student.user.lastNameRu} ${a.student.user.firstNameRu}`,
          groupName: a.student.group?.name ?? null,
          disciplineName: pickLocalized(a.periodGrade.course.discipline, 'name', locale),
          periodName: a.periodGrade.course.period.name,
          // Оценка до пересмотра берётся из самой апелляции: после её
          // удовлетворения текущая оценка уже новая, и колонка показывала бы
          // «B → B» вместо «C → B». Текущая оценка остаётся запасным
          // источником для записей, заведённых до появления поля
          scoreBefore: decOrNull(a.scoreBefore) ?? decOrNull(a.periodGrade.finalScore),
          letterBefore: a.letterBefore ?? a.periodGrade.letter,
          letterAfter: a.letterAfter,
          decidedBy: a.decidedBy
            ? `${a.decidedBy.lastNameRu} ${a.decidedBy.firstNameRu}`
            : null,
        }))}
        transfers={
          transfers
            ? {
                totals: transfers.totals,
                rows: transfers.rows.map((r) => ({
                  id: r.id,
                  sourceKind: r.sourceKind,
                  sourceOrg: r.sourceOrg,
                  sourceDisciplineName: r.sourceDisciplineName,
                  credits: dec(r.credits),
                  letter: r.letter,
                  gpaPoint: decOrNull(r.gpaPoint),
                  documentRef: r.documentRef,
                  slotCode: r.slot?.slotCode ?? null,
                  disciplineName: r.discipline
                    ? pickLocalized(r.discipline, 'name', locale)
                    : null,
                  approved: r.approvedAt != null,
                  approvedBy: r.approvedBy
                    ? `${r.approvedBy.lastNameRu} ${r.approvedBy.firstNameRu}`
                    : null,
                })),
              }
            : null
        }
        honours={honours}
        slots={slots.map((s) => ({
          id: s.id,
          label: `${s.slotCode ?? '—'} · ${s.cycle}/${s.component} · ${dec(s.credits)} кр`,
        }))}
        disciplines={disciplines.map((d) => ({
          id: d.id,
          label: `${d.code} · ${pickLocalized(d, 'name', locale)}`,
        }))}
      />
    </>
  );
}
