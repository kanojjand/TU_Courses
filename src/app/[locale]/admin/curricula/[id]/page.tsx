import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { can } from '@/lib/rbac';
import { pickLocalized } from '@/i18n/request';
import { getCurriculum, validate } from '@/server/curriculum';
import { CurriculumBuilder } from '@/components/curriculum/curriculum-builder';

export const dynamic = 'force-dynamic';

/**
 * F-CUR-02, F-CUR-06, F-CUR-07. Конструктор учебного плана.
 *
 * Валидатор прогоняется при каждом открытии страницы, а не только по кнопке:
 * методист должен видеть текущее состояние соответствия, а не результат
 * последнего запуска, который мог устареть после правок.
 */
export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requirePageAccess(locale, 'curriculum:view');

  const curriculum = await getCurriculum(id);
  if (!curriculum) notFound();

  const report = validate(curriculum);

  // Дисциплины кафедры, из которых собираются позиции плана
  const disciplines = await prisma.discipline.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
    orderBy: { code: 'asc' },
    take: 1000,
  });

  const otherVersions = await prisma.curriculum.findMany({
    where: { programId: curriculum.programId, id: { not: id } },
    select: { id: true, admissionYear: true, version: true, status: true },
    orderBy: [{ admissionYear: 'desc' }, { version: 'desc' }],
  });

  return (
    <CurriculumBuilder
      canEdit={can(user, 'curriculum:edit')}
      canApprove={can(user, 'curriculum:approve')}
      curriculum={{
        id: curriculum.id,
        programCode: curriculum.program.code,
        programName: pickLocalized(curriculum.program, 'name', locale),
        admissionYear: curriculum.admissionYear,
        version: curriculum.version,
        studyForm: curriculum.studyForm,
        status: curriculum.status,
        termsCount: curriculum.termsCount,
        profileCode: curriculum.gosoProfile.code,
        profileName: curriculum.gosoProfile.nameRu,
        councilProtocolNo: curriculum.councilProtocolNo,
        councilDate: curriculum.councilDate?.toISOString().slice(0, 10) ?? null,
        rejectionReason: curriculum.rejectionReason,
        approvedBy: curriculum.approvedBy
          ? `${curriculum.approvedBy.lastNameRu} ${curriculum.approvedBy.firstNameRu}`
          : null,
        approvedAt: curriculum.approvedAt?.toISOString() ?? null,
      }}
      modules={curriculum.modules.map((m) => ({
        id: m.id,
        code: m.code,
        nameKk: m.nameKk,
        nameRu: m.nameRu,
        sortOrder: m.sortOrder,
      }))}
      slots={curriculum.slots.map((s) => ({
        id: s.id,
        moduleId: s.moduleId,
        slotCode: s.slotCode,
        cycle: s.cycle,
        component: s.component,
        credits: Number(s.credits),
        totalHours: s.totalHours,
        hoursLecture: s.hoursLecture,
        hoursLab: s.hoursLab,
        hoursPractice: s.hoursPractice,
        hoursIndividual: s.hoursIndividual,
        hoursSrs: s.hoursSrs,
        hoursSrsp: s.hoursSrsp,
        hoursPracticeField: s.hoursPracticeField,
        hoursThesis: s.hoursThesis,
        controlForm: s.controlForm,
        hasCourseWork: s.hasCourseWork,
        terms: s.terms,
        controlTerm: s.controlTerm,
        chooseN: s.chooseN,
        isMinorSlot: s.isMinorSlot,
        sortOrder: s.sortOrder,
        isMandatory: s.options.some((o) => o.discipline.gosoMandatory != null),
        options: s.options.map((o) => ({
          disciplineId: o.disciplineId,
          code: o.discipline.code,
          name: pickLocalized(o.discipline, 'name', locale),
          gosoMandatoryName: o.discipline.gosoMandatory?.nameRu ?? null,
        })),
      }))}
      disciplines={disciplines.map((d) => ({
        id: d.id,
        code: d.code,
        name: pickLocalized(d, 'name', locale),
      }))}
      otherVersions={otherVersions}
      report={{
        valid: report.valid,
        totals: report.totals,
        compliance: report.compliance,
        errors: report.errors,
        warnings: report.warnings,
      }}
    />
  );
}
