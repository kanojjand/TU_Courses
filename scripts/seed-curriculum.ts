import { PrismaClient } from '@prisma/client';

import { seedGosoProfiles, seedPilotCurriculum } from '../src/server/seed/curriculum';
import { validateCurriculum, type SlotSpec } from '../src/domain/goso';

/**
 * Загрузка модуля учебных планов — этап 2 раздела 8 ТЗ.
 *
 *   npm run db:seed:curriculum
 *
 * Загружает профили ГОСО и пилотный план 6В01601, после чего прогоняет
 * валидатор и печатает панель соответствия. Это же и есть проверка
 * критерия приёмки № 1 раздела 8.1 на реальной базе, а не только в тестах.
 */

const prisma = new PrismaClient();

async function main() {
  console.log('→ Профили ГОСО и обязательные дисциплины цикла ООД…');
  await seedGosoProfiles(prisma);
  const profiles = await prisma.gosoProfile.count();
  const mandatory = await prisma.gosoMandatoryDiscipline.count();
  console.log(`  ✓ профилей ${profiles}, обязательных дисциплин ${mandatory}`);

  console.log('→ Пилотный учебный план 6В01601…');
  const result = await seedPilotCurriculum(prisma);
  console.log(
    `  ✓ план ${result.created ? 'создан' : 'обновлён'}: ` +
      `${result.slots} позиций, ${result.disciplines} дисциплин`
  );

  // ── Прогон валидатора на загруженных данных ────────────────────────────
  const curriculum = await prisma.curriculum.findUniqueOrThrow({
    where: { id: result.curriculumId },
    include: {
      gosoProfile: { include: { mandatory: true } },
      slots: {
        include: {
          options: {
            include: { discipline: { select: { id: true, nameRu: true, gosoMandatory: true } } },
          },
        },
      },
    },
  });

  const slots: SlotSpec[] = curriculum.slots.map((s) => ({
    id: s.id,
    slotCode: s.slotCode,
    cycle: s.cycle,
    component: s.component,
    credits: s.credits.toNumber(),
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
    terms: s.terms,
    creditsByTerm: (s.creditsByTerm ?? {}) as Record<string, number>,
    controlTerm: s.controlTerm,
    chooseN: s.chooseN,
    isMinorSlot: s.isMinorSlot,
    options: s.options.map((o) => ({
      disciplineId: o.disciplineId,
      nameRu: o.discipline.nameRu,
      gosoMandatorySlug: o.discipline.gosoMandatory?.slug ?? null,
    })),
  }));

  const p = curriculum.gosoProfile;
  const report = validateCurriculum(
    {
      code: p.code,
      totalCredits: p.totalCredits,
      totalHoursMin: p.totalHoursMin,
      hoursPerCredit: p.hoursPerCredit,
      oodCredits: p.oodCredits,
      oodOkCredits: p.oodOkCredits,
      oodVkKvCredits: p.oodVkKvCredits,
      bdPdCreditsMin: p.bdPdCreditsMin,
      finalCertCreditsMin: p.finalCertCreditsMin,
      yearCreditsNorm: p.yearCreditsNorm,
      mandatory: p.mandatory.map((m) => ({
        slug: m.slug,
        nameRu: m.nameRu,
        credits: m.credits,
        hours: m.hours,
        controlForm: m.controlForm,
        isModule: m.isModule,
      })),
    },
    slots
  );

  await prisma.curriculumValidation.create({
    data: {
      curriculumId: curriculum.id,
      isValid: report.valid,
      findings: report.findings as never,
    },
  });

  console.log('\n  Панель соответствия ГОСО');
  const pad = (s: string, n: number) => s.padEnd(n, ' ');
  for (const row of report.compliance) {
    const unit = row.unit === 'hours' ? 'ч' : 'кр';
    console.log(
      `  ${row.ok ? '✓' : '✗'} ${pad(row.rule, 5)} ${pad(row.label, 38)} ` +
        `требуется ${row.isMinimum ? '≥ ' : ''}${row.required} ${unit}, ` +
        `в плане ${row.actual} ${unit}`
    );
  }

  if (report.errors.length > 0) {
    console.log('\n  Блокирующие ошибки:');
    for (const e of report.errors) console.log(`  ✗ ${e.rule}: ${e.message}`);
  }
  if (report.warnings.length > 0) {
    console.log('\n  Предупреждения (утверждению не мешают):');
    for (const w of report.warnings) console.log(`  ! ${w.rule}: ${w.message}`);
  }

  console.log(
    `\n${report.valid ? '✓' : '✗'} Валидатор ГОСО: план ` +
      `${report.valid ? 'соответствует нормативу' : 'НЕ соответствует нормативу'} ` +
      `(${report.totals.credits} кредитов, ${report.totals.hours} часов)`
  );
  if (!report.valid) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('✗ Ошибка загрузки учебного плана:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
