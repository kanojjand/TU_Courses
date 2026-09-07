import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Демонстрационные данные этапа 3: учебный год, окна регистрации,
 * академическая группа по плану 6В01601 и обучающиеся с эдвайзером.
 *
 *   npm run db:seed:iep
 *
 * Нужен, чтобы пройти сценарий раздела 8 целиком: студент формирует ИУП,
 * эдвайзер согласует, офис Регистратора фиксирует, студент регистрируется.
 * Выполняется после db:seed и db:seed:curriculum, идемпотентно.
 *
 * Данные вымышлены и предназначены только для пилота.
 */

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Demo2026!lms';

const STUDENTS = [
  { last: 'Аманжолова', first: 'Аружан', middle: 'Ержанқызы' },
  { last: 'Сериков', first: 'Нурлан', middle: 'Бахытович' },
  { last: 'Оспанова', first: 'Дана', middle: 'Маратовна' },
];

function translit(s: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
    ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya',
    ъ: '', ь: '', ё: 'e',
  };
  return s.toLowerCase().split('').map((c) => map[c] ?? c).join('');
}

async function main() {
  const program = await prisma.educationProgram.findUnique({ where: { code: '6B01601' } });
  if (!program) {
    throw new Error('Программа 6B01601 не найдена — сначала выполните npm run db:seed:curriculum');
  }

  const curriculum = await prisma.curriculum.findFirst({
    where: { programId: program.id },
    orderBy: [{ admissionYear: 'desc' }, { version: 'desc' }],
  });
  if (!curriculum) throw new Error('Учебный план 6B01601 не найден.');

  console.log('→ Учебный год и академические периоды…');
  const yearName = `${curriculum.admissionYear}-${curriculum.admissionYear + 1}`;
  const year = await prisma.academicYear.upsert({
    where: { name: yearName },
    create: {
      name: yearName,
      startDate: new Date(`${curriculum.admissionYear}-09-01`),
      endDate: new Date(`${curriculum.admissionYear + 1}-06-30`),
      isCurrent: false,
    },
    update: {},
  });

  const periodSpecs = [
    {
      ordinal: 1,
      name: '1 семестр',
      start: `${curriculum.admissionYear}-09-01`,
      end: `${curriculum.admissionYear}-12-20`,
      exam: [`${curriculum.admissionYear}-12-21`, `${curriculum.admissionYear + 1}-01-10`],
    },
    {
      ordinal: 2,
      name: '2 семестр',
      start: `${curriculum.admissionYear + 1}-01-20`,
      end: `${curriculum.admissionYear + 1}-05-15`,
      exam: [`${curriculum.admissionYear + 1}-05-16`, `${curriculum.admissionYear + 1}-06-10`],
    },
  ];

  const periods = [];
  for (const spec of periodSpecs) {
    const period = await prisma.academicPeriod.upsert({
      where: { academicYearId_ordinal: { academicYearId: year.id, ordinal: spec.ordinal } },
      create: {
        academicYearId: year.id,
        name: spec.name,
        type: 'SEMESTER',
        ordinal: spec.ordinal,
        startDate: new Date(spec.start),
        endDate: new Date(spec.end),
        registrationStart: new Date(spec.start),
        registrationEnd: new Date(spec.start),
        examStart: new Date(spec.exam[0]),
        examEnd: new Date(spec.exam[1]),
        // R-10: семестр — не менее 15 недель
        weeksCount: 15,
      },
      update: { weeksCount: 15 },
    });
    periods.push(period);
  }
  console.log(`  ✓ ${yearName}, периодов ${periods.length}, по 15 недель (R-10)`);

  console.log('→ Окна регистрации…');
  // Окно основной регистрации открыто «сейчас», чтобы сценарий проходился
  // без правки дат вручную
  const now = new Date();
  const opensAt = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const closesAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  for (const [kind, credits] of [
    ['MAIN', { minCredits: 24, maxCredits: 68 }],
    ['ADD_DROP', { minCredits: null, maxCredits: null }],
  ] as const) {
    await prisma.registrationWindow.upsert({
      where: { periodId_kind: { periodId: periods[0].id, kind } },
      create: { periodId: periods[0].id, kind, opensAt, closesAt, ...credits },
      update: { opensAt, closesAt, ...credits },
    });
  }
  console.log('  ✓ основная регистрация открыта, лимиты 24–68 кредитов');

  console.log('→ График учебного процесса…');
  const existingEvents = await prisma.calendarEvent.count({ where: { periodId: periods[0].id } });
  if (existingEvents === 0) {
    await prisma.calendarEvent.createMany({
      data: [
        {
          periodId: periods[0].id,
          kind: 'THEORY',
          courseNo: 1,
          startDate: new Date(periodSpecs[0].start),
          endDate: new Date(periodSpecs[0].end),
          note: 'Теоретическое обучение, 15 недель',
        },
        {
          periodId: periods[0].id,
          kind: 'EXAM_SESSION',
          courseNo: 1,
          startDate: new Date(periodSpecs[0].exam[0]),
          endDate: new Date(periodSpecs[0].exam[1]),
        },
      ],
    });
  }
  console.log('  ✓ теоретическое обучение и сессия');

  console.log('→ Эдвайзер и куратор…');
  const advisor = await prisma.teacherProfile.findFirst({
    where: { user: { email: 'g.tulegenova@demo.example.kz' } },
    select: { id: true, userId: true },
  });
  if (!advisor) {
    throw new Error(
      'Демонстрационный преподаватель не найден — сначала выполните npm run db:seed'
    );
  }

  console.log('→ Академическая группа…');
  const groupName = `ТАР-${String(curriculum.admissionYear).slice(2)}-1к`;
  const existingGroup = await prisma.studyGroup.findFirst({
    where: { programId: program.id, name: groupName },
  });
  const group = existingGroup
    ? await prisma.studyGroup.update({
        where: { id: existingGroup.id },
        data: { curriculumId: curriculum.id, curatorId: advisor.id, admissionYear: curriculum.admissionYear },
      })
    : await prisma.studyGroup.create({
        data: {
          programId: program.id,
          name: groupName,
          studyYear: 1,
          admissionYear: curriculum.admissionYear,
          language: 'KK',
          studyForm: 'FULL_TIME',
          curriculumId: curriculum.id,
          curatorId: advisor.id,
        },
      });

  await prisma.staffAssignment.deleteMany({ where: { groupId: group.id, kind: 'CURATOR' } });
  await prisma.staffAssignment.create({
    data: { userId: advisor.userId, kind: 'CURATOR', groupId: group.id },
  });
  console.log(`  ✓ группа ${groupName}, куратор назначен`);

  console.log('→ Обучающиеся…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const created: string[] = [];

  for (const [i, s] of STUDENTS.entries()) {
    const email = `${translit(s.first)[0]}.${translit(s.last)}@demo.example.kz`;
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        lastNameKk: s.last,
        firstNameKk: s.first,
        middleNameKk: s.middle,
        lastNameRu: s.last,
        firstNameRu: s.first,
        middleNameRu: s.middle,
        lastNameEn: s.last,
        firstNameEn: s.first,
        uiLanguage: 'RU',
        status: 'ACTIVE',
      },
      update: {},
      select: { id: true },
    });

    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'STUDENT' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        programId: program.id,
        groupId: group.id,
        advisorId: advisor.id,
        curriculumId: curriculum.id,
        studyYear: 1,
        studyForm: 'FULL_TIME',
        language: 'KK',
        admissionYear: curriculum.admissionYear,
        creditsEarned: new Prisma.Decimal(0),
      },
      update: {
        groupId: group.id,
        advisorId: advisor.id,
        curriculumId: curriculum.id,
        admissionYear: curriculum.admissionYear,
      },
      select: { id: true },
    });

    const membership = await prisma.groupMembership.findFirst({
      where: { studentId: profile.id, leftOn: null },
    });
    if (!membership) {
      await prisma.groupMembership.create({
        data: { groupId: group.id, studentId: profile.id },
      });
    }

    const assignment = await prisma.staffAssignment.findFirst({
      where: { studentId: profile.id, kind: 'ADVISOR', validTo: null },
    });
    if (!assignment) {
      await prisma.staffAssignment.create({
        data: { userId: advisor.userId, kind: 'ADVISOR', studentId: profile.id },
      });
    }

    created.push(email);
    if (i === 0) {
      await prisma.studentStatusHistory.deleteMany({ where: { studentId: profile.id } });
      await prisma.studentStatusHistory.create({
        data: {
          studentId: profile.id,
          status: 'ACTIVE',
          reasonCode: 'OTHER',
          reasonText: 'Зачисление на первый курс',
          orderNo: '№ 118-с',
          orderDate: new Date(`${curriculum.admissionYear}-08-25`),
          startsOn: new Date(`${curriculum.admissionYear}-09-01`),
        },
      });
    }
  }

  console.log(`  ✓ обучающихся ${created.length}, пароль ${DEMO_PASSWORD}`);
  for (const email of created) console.log(`    · ${email}`);

  // ── Реализации дисциплин первого семестра ───────────────────────────────
  // Без них строке ИУП не на что регистрироваться. Квота намеренно мала:
  // на ней проверяется лист ожидания (F-IEP-05).
  console.log('→ Реализации дисциплин первого семестра…');
  const firstTermSlots = await prisma.curriculumSlot.findMany({
    where: { curriculumId: curriculum.id, terms: { has: 1 } },
    include: { options: { select: { disciplineId: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  const disciplineIds = [
    ...new Set(firstTermSlots.flatMap((s) => s.options.map((o) => o.disciplineId))),
  ];
  const disciplines = await prisma.discipline.findMany({
    where: { id: { in: disciplineIds } },
    select: { id: true, code: true, nameRu: true },
  });

  let offerings = 0;
  for (const [i, d] of disciplines.entries()) {
    const slug = `tar-${curriculum.admissionYear}-1-${d.code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}`;
    await prisma.course.upsert({
      where: { slug },
      create: {
        disciplineId: d.id,
        periodId: periods[0].id,
        slug,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        // Первая дисциплина идёт с квотой на двоих: третий регистрирующийся
        // попадёт в лист ожидания
        maxEnrollment: i === 0 ? 2 : 30,
        teachers: { create: { teacherId: advisor.id, isLead: true } },
        questionBank: { create: {} },
      },
      update: { status: 'PUBLISHED', periodId: periods[0].id },
    });
    offerings++;
  }
  console.log(`  ✓ реализаций ${offerings}, у первой квота 2 места`);

  console.log('\n✓ Данные этапа 3 загружены.');
  console.log('  Сценарий: студент → /my/iep → отправить эдвайзеру →');
  console.log('  g.tulegenova@demo.example.kz → /advisor → согласовать →');
  console.log('  registrar@demo.example.kz → /admin/ieps → зафиксировать.');
  console.log('\n⚠  Данные вымышлены и предназначены только для пилота.');
}

main()
  .catch((error) => {
    console.error('✗ Ошибка загрузки данных этапа 3:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
