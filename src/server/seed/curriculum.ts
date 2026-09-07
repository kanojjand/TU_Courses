import { PrismaClient, Prisma } from '@prisma/client';

import { GOSO_PROFILES, GOSO_MANDATORY, MANDATORY_APPLIES_TO } from './goso';
import { CURRICULUM_6B01601, type PilotCurriculum } from './curriculum-6b01601';

/**
 * Наполнение модуля учебных планов — этап 2 раздела 8 ТЗ.
 *
 * Загружает справочник профилей ГОСО и пилотный учебный план ОП 6В01601.
 * Идемпотентно: повторный запуск обновляет данные, а не создаёт дубликаты.
 * План загружается со статусом «черновик» — утверждение проходит через
 * маршрут согласования, как и полагается по F-CUR-01.
 */

/** Справочник профилей ГОСО и обязательных дисциплин цикла ООД (R-01…R-08) */
export async function seedGosoProfiles(prisma: PrismaClient): Promise<void> {
  for (const p of GOSO_PROFILES) {
    const { code, validFrom, ...rest } = p;
    const data = { ...rest, validFrom: new Date(validFrom) };
    const profile = await prisma.gosoProfile.upsert({
      where: { code },
      create: { code, ...data },
      update: data,
    });

    if (!MANDATORY_APPLIES_TO.includes(code)) continue;
    for (const m of GOSO_MANDATORY) {
      const { slug, ...mrest } = m;
      await prisma.gosoMandatoryDiscipline.upsert({
        where: { profileId_slug: { profileId: profile.id, slug } },
        create: { profileId: profile.id, slug, ...mrest },
        update: mrest,
      });
    }
  }
}

export interface SeedCurriculumResult {
  curriculumId: string;
  programId: string;
  slots: number;
  disciplines: number;
  created: boolean;
}

/**
 * Пилотный план 6В01601: 47 позиций, 71 дисциплина, 12 модулей, 8 семестров.
 *
 * Существующий план того же года и версии перезаписывается: модули и позиции
 * удаляются каскадом и создаются заново. Так повторный запуск сида приводит
 * план к эталону, а не накапливает расхождения.
 */
export async function seedPilotCurriculum(
  prisma: PrismaClient,
  plan: PilotCurriculum = CURRICULUM_6B01601
): Promise<SeedCurriculumResult> {
  const profile = await prisma.gosoProfile.findUnique({
    where: { code: plan.program.gosoProfileCode },
    include: { mandatory: true },
  });
  if (!profile) {
    throw new Error(
      `Профиль ГОСО ${plan.program.gosoProfileCode} не найден — сначала выполните seedGosoProfiles.`
    );
  }
  const mandatoryBySlug = new Map(profile.mandatory.map((m) => [m.slug, m.id]));

  // ── Оргструктура ─────────────────────────────────────────────────────────
  const faculty = await prisma.faculty.upsert({
    where: { code: plan.program.facultyCode },
    create: {
      code: plan.program.facultyCode,
      nameKk: plan.program.facultyNameKk,
      nameRu: plan.program.facultyNameRu,
      nameEn: plan.program.facultyNameRu,
    },
    update: {},
  });

  const department = await prisma.department.upsert({
    where: { code: plan.program.departmentCode },
    create: {
      facultyId: faculty.id,
      code: plan.program.departmentCode,
      nameKk: plan.program.departmentNameKk,
      nameRu: plan.program.departmentNameRu,
      nameEn: plan.program.departmentNameRu,
    },
    update: {},
  });

  const program = await prisma.educationProgram.upsert({
    where: { code: plan.program.code },
    create: {
      departmentId: department.id,
      code: plan.program.code,
      nameKk: plan.program.nameKk,
      nameRu: plan.program.nameRu,
      nameEn: plan.program.nameEn,
      level: 'BACHELOR',
      language: 'KK',
      durationYears: Math.round(plan.program.studyYears),
      totalCredits: profile.totalCredits,
      gosoProfileId: profile.id,
      isDualSubject: plan.program.isDualSubject,
    },
    update: {
      gosoProfileId: profile.id,
      isDualSubject: plan.program.isDualSubject,
      totalCredits: profile.totalCredits,
    },
  });

  // ── Справочник дисциплин ─────────────────────────────────────────────────
  // Цикл, компонент и кредиты у дисциплины — значения по умолчанию для
  // существующего кода курсов; нормативные значения живут в позиции плана.
  const disciplineIdByCode = new Map<string, string>();
  for (const slot of plan.slots) {
    for (const option of slot.options) {
      if (disciplineIdByCode.has(option.code)) continue;
      const gosoMandatoryId = option.gosoMandatorySlug
        ? (mandatoryBySlug.get(option.gosoMandatorySlug) ?? null)
        : null;
      const data = {
        departmentId: department.id,
        programId: program.id,
        nameKk: option.nameKk,
        nameRu: option.nameRu,
        nameEn: option.nameEn ?? option.nameRu,
        credits: Math.round(slot.credits),
        cycle: slot.cycle === 'IA' || slot.cycle === 'DVO' ? 'PD' : slot.cycle,
        component: slot.component,
        level: 'BACHELOR' as const,
        language: 'KK' as const,
        gosoMandatoryId,
        isPractice: option.isPractice,
      };
      const saved = await prisma.discipline.upsert({
        where: { code: option.code },
        create: { code: option.code, ...data },
        update: data,
      });
      disciplineIdByCode.set(option.code, saved.id);
    }
  }

  // ── Учебный план ─────────────────────────────────────────────────────────
  const key = {
    programId_admissionYear_version_studyForm: {
      programId: program.id,
      admissionYear: plan.curriculum.admissionYear,
      version: plan.curriculum.version,
      studyForm: plan.curriculum.studyForm,
    },
  };
  const existing = await prisma.curriculum.findUnique({ where: key, select: { id: true } });

  const curriculum = await prisma.curriculum.upsert({
    where: key,
    create: {
      programId: program.id,
      gosoProfileId: profile.id,
      admissionYear: plan.curriculum.admissionYear,
      version: plan.curriculum.version,
      studyForm: plan.curriculum.studyForm,
      termsCount: plan.curriculum.termsCount,
    },
    update: { gosoProfileId: profile.id, termsCount: plan.curriculum.termsCount },
    select: { id: true },
  });

  // Позиции и модули пересоздаются целиком — сверять их поштучно незачем
  await prisma.curriculumSlot.deleteMany({ where: { curriculumId: curriculum.id } });
  await prisma.curriculumModule.deleteMany({ where: { curriculumId: curriculum.id } });

  const moduleIds: string[] = [];
  for (const m of plan.modules) {
    const created = await prisma.curriculumModule.create({
      data: {
        curriculumId: curriculum.id,
        code: m.code,
        nameKk: m.nameKk,
        nameRu: m.nameRu,
        sortOrder: m.sortOrder,
      },
      select: { id: true },
    });
    moduleIds.push(created.id);
  }

  let totalCredits = 0;
  let totalHours = 0;
  for (const s of plan.slots) {
    totalCredits += s.credits;
    totalHours += s.totalHours;
    await prisma.curriculumSlot.create({
      data: {
        curriculumId: curriculum.id,
        moduleId: s.moduleIndex == null ? null : (moduleIds[s.moduleIndex] ?? null),
        slotCode: s.slotCode,
        cycle: s.cycle,
        component: s.component,
        credits: new Prisma.Decimal(s.credits),
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
        creditsByTerm: s.creditsByTerm,
        controlTerm: s.controlTerm,
        teachingLang: s.teachingLang,
        chooseN: s.chooseN,
        isMinorSlot: s.isMinorSlot,
        sortOrder: s.sortOrder,
        options: {
          create: s.options.map((o, i) => ({
            disciplineId: disciplineIdByCode.get(o.code)!,
            isDefault: o.isDefault || i === 0,
            isMinorPlaceholder: o.isMinorPlaceholder,
            sortOrder: i,
          })),
        },
      },
    });
  }

  await prisma.curriculum.update({
    where: { id: curriculum.id },
    data: { totalCredits: new Prisma.Decimal(totalCredits), totalHours },
  });

  return {
    curriculumId: curriculum.id,
    programId: program.id,
    slots: plan.slots.length,
    disciplines: disciplineIdByCode.size,
    created: !existing,
  };
}
