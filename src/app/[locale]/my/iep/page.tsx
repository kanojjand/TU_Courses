import { setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { creditsInYear } from '@/domain/iep';
import { loadIepWorkspace, getStudentIep } from '@/server/iep';
import { IepWizard } from '@/components/student/iep-wizard';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/**
 * F-IEP-01…F-IEP-08. Кабинет обучающегося: индивидуальный учебный план.
 *
 * Одна страница на весь маршрут: формирование выбора, отправка эдвайзеру,
 * отслеживание согласования и — после утверждения — регистрация на
 * реализации дисциплин.
 */
export default async function IepPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  if (!user.studentProfileId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Раздел доступен обучающимся"
          description="Индивидуальный учебный план формирует студент. У вашей учётной записи нет профиля обучающегося."
        />
      </div>
    );
  }

  const [student, academicYear] = await Promise.all([
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: user.studentProfileId },
      select: {
        id: true,
        studyYear: true,
        admissionYear: true,
        program: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
        group: { select: { name: true } },
        advisor: {
          select: { user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } } },
        },
      },
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }) ??
      prisma.academicYear.findFirst({ orderBy: { startDate: 'desc' } }),
  ]);

  if (!academicYear) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Учебный год не заведён"
          description="Формирование ИУП откроется после того, как офис Регистратора заведёт учебный год и академические периоды."
        />
      </div>
    );
  }

  const workspace = await loadIepWorkspace({
    studentId: student.id,
    academicYearId: academicYear.id,
    studyYear: student.studyYear,
  });

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Учебный план не назначен"
          description={
            `Для программы ${student.program.code} и года набора ${student.admissionYear} ` +
            'нет утверждённого учебного плана. Обратитесь в офис Регистратора.'
          }
        />
      </div>
    );
  }

  const iep = await getStudentIep(student.id, academicYear.id);

  // Реализации дисциплин года — одним запросом на все строки ИУП, а не
  // по запросу на строку
  const disciplineIds = [...new Set(workspace.plan.offers.flatMap((o) => o.options.map((x) => x.disciplineId)))];
  const offerings = await prisma.course.findMany({
    where: {
      disciplineId: { in: disciplineIds },
      period: { academicYearId: academicYear.id },
      status: { in: ['APPROVED', 'PUBLISHED'] },
    },
    select: {
      id: true,
      disciplineId: true,
      streamName: true,
      maxEnrollment: true,
      period: { select: { id: true, name: true, ordinal: true } },
      teachers: {
        where: { isLead: true },
        select: { teacher: { select: { user: { select: { lastNameRu: true, firstNameRu: true } } } } },
      },
      _count: { select: { enrollments: { where: { cancelledAt: null, status: 'REGISTERED' } } } },
    },
    orderBy: [{ period: { ordinal: 'asc' } }, { streamName: 'asc' }],
  });

  const now = new Date();
  const windows = await prisma.registrationWindow.findMany({
    where: { period: { academicYearId: academicYear.id } },
    select: { kind: true, opensAt: true, closesAt: true, minCredits: true, maxCredits: true },
    orderBy: { opensAt: 'asc' },
  });

  return (
    <IepWizard
      academicYearId={academicYear.id}
      academicYearName={academicYear.name}
      student={{
        studyYear: student.studyYear,
        programCode: student.program.code,
        programName: pickLocalized(student.program, 'name', locale),
        groupName: student.group?.name ?? null,
        advisorName: student.advisor
          ? `${student.advisor.user.lastNameRu} ${student.advisor.user.firstNameRu}`
          : null,
      }}
      curriculum={workspace.curriculum}
      terms={workspace.terms}
      limits={workspace.context.limits}
      status={iep?.status ?? null}
      advisorComment={iep?.advisorComment ?? null}
      offers={workspace.plan.offers.map((o) => ({
        slotId: o.slot.id,
        slotCode: o.slot.slotCode,
        cycle: o.slot.cycle,
        component: o.slot.component,
        credits: creditsInYear(o.slot, workspace.terms),
        terms: o.slot.terms,
        controlTerm: o.slot.controlTerm,
        chooseN: o.slot.chooseN,
        isMinorSlot: o.slot.isMinorSlot,
        isAutomatic: o.isAutomatic,
        options: o.options,
      }))}
      initialSelections={workspace.selections.map((s) => ({
        slotId: s.slotId,
        disciplineId: s.disciplineId,
      }))}
      items={(iep?.items ?? []).map((i) => ({
        id: i.id,
        disciplineId: i.disciplineId,
        disciplineCode: i.discipline.code,
        disciplineName: pickLocalized(i.discipline, 'name', locale),
        termNo: i.termNo,
        credits: Number(i.credits),
        isRetake: i.isRetake,
        registrations: i.registrations.map((r) => ({
          id: r.id,
          status: r.status,
          attemptNo: r.attemptNo,
          waitlistPos: r.waitlistPos,
          courseId: r.course.id,
          periodName: r.course.period.name,
        })),
      }))}
      offerings={offerings.map((c) => ({
        id: c.id,
        disciplineId: c.disciplineId,
        streamName: c.streamName,
        periodName: c.period.name,
        capacity: c.maxEnrollment,
        registered: c._count.enrollments,
        teacher: c.teachers[0]
          ? `${c.teachers[0].teacher.user.lastNameRu} ${c.teachers[0].teacher.user.firstNameRu}`
          : null,
      }))}
      windows={windows.map((w) => ({
        kind: w.kind,
        opensAt: w.opensAt.toISOString(),
        closesAt: w.closesAt.toISOString(),
        isOpen: now >= w.opensAt && now <= w.closesAt,
      }))}
    />
  );
}
