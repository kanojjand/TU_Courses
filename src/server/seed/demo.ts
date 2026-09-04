import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { encryptIin, hashIin } from '@/lib/crypto';
import { slugify } from '@/lib/utils';
import { summarizeProgress } from '@/domain/activity';
import {
  COURSE_INF1201_MODULES,
  DEMO_QUESTIONS,
  DEPARTMENTS,
  DISCIPLINES,
  FACULTY,
  PROGRAMS,
  STAFF,
  STUDENT_NAMES,
  TEACHERS,
} from './demo-data';

/**
 * Демонстрационный набор данных.
 *
 * Все персональные данные вымышлены. Набор предназначен для пилотной
 * эксплуатации на обезличенных данных (раздел 2.2 ТЗ). Пароль всех
 * демонстрационных учётных записей — DEMO_PASSWORD.
 */

const DEMO_PASSWORD = 'Demo2026!lms';

/**
 * Генерация корректного по контрольному разряду демонстрационного ИИН.
 *
 * Возвращает null, если база непригодна (контрольный разряд = 10 по обоим
 * наборам весов). Перебор следующего seed — задача вызывающего: рекурсия
 * здесь выдавала бы ИИН, который затем повторно получит следующий по
 * порядку вызов, и нарушала бы уникальность iinHash.
 */
function makeIin(seed: number): string | null {
  const base = String(10000000000 + ((seed * 7919) % 89999999999)); // ровно 11 цифр
  const digits = base.split('').map(Number);
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  const sum = (w: number[]) => w.reduce((s, weight, i) => s + weight * digits[i], 0);
  let control = sum(w1) % 11;
  if (control === 10) control = sum(w2) % 11;
  if (control === 10) return null;
  return base + String(control);
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а:'a',ә:'a',б:'b',в:'v',г:'g',ғ:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',қ:'q',
    л:'l',м:'m',н:'n',ң:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ұ:'u',ү:'u',ф:'f',х:'h',
    һ:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',і:'i',ь:'',э:'e',ю:'yu',я:'ya',
  };
  return value
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .replace(/[^a-z]/g, '');
}

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const roles = await prisma.role.findMany();
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;

  let iinSeed = 1000;
  const usedIins = new Set<string>();
  /** Детерминированная последовательность уникальных ИИН — одинакова при каждом запуске */
  const nextIin = (): string => {
    for (let guard = 0; guard < 10_000; guard += 1) {
      const iin = makeIin(iinSeed++);
      if (iin && !usedIins.has(iin)) {
        usedIins.add(iin);
        return iin;
      }
    }
    throw new Error('Не удалось сгенерировать уникальный демонстрационный ИИН.');
  };

  // ── Учебный год и академические периоды ───────────────────────────────────
  const year = await prisma.academicYear.upsert({
    where: { name: '2026-2027' },
    create: {
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
    },
    update: { isCurrent: true },
  });

  const period = await prisma.academicPeriod.upsert({
    where: { academicYearId_ordinal: { academicYearId: year.id, ordinal: 1 } },
    create: {
      academicYearId: year.id,
      name: '1 семестр',
      type: 'SEMESTER',
      ordinal: 1,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-12-20'),
      registrationStart: new Date('2026-08-15'),
      registrationEnd: new Date('2026-09-05'),
      examStart: new Date('2026-12-21'),
      examEnd: new Date('2027-01-10'),
      status: 'ACTIVE',
      isCurrent: true,
    },
    update: { status: 'ACTIVE', isCurrent: true },
  });

  await prisma.academicPeriod.upsert({
    where: { academicYearId_ordinal: { academicYearId: year.id, ordinal: 2 } },
    create: {
      academicYearId: year.id,
      name: '2 семестр',
      type: 'SEMESTER',
      ordinal: 2,
      startDate: new Date('2027-01-19'),
      endDate: new Date('2027-05-15'),
      registrationStart: new Date('2027-01-05'),
      registrationEnd: new Date('2027-01-22'),
      examStart: new Date('2027-05-18'),
      examEnd: new Date('2027-06-10'),
      status: 'PLANNED',
    },
    update: {},
  });

  // ── Организационная структура ─────────────────────────────────────────────
  const faculty = await prisma.faculty.upsert({
    where: { code: FACULTY.code },
    create: FACULTY,
    update: {},
  });

  const departmentByCode = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: d.code },
      create: { ...d, facultyId: faculty.id },
      update: {},
    });
    departmentByCode.set(d.code, record.id);
  }

  const programByCode = new Map<string, string>();
  for (const p of PROGRAMS) {
    const { departmentCode, ...rest } = p;
    const record = await prisma.educationProgram.upsert({
      where: { code: p.code },
      create: { ...rest, departmentId: departmentByCode.get(departmentCode)! },
      update: {},
    });
    programByCode.set(p.code, record.id);
  }

  const disciplineByCode = new Map<string, { id: string; credits: number }>();
  for (const d of DISCIPLINES) {
    const { departmentCode, programCode, ...rest } = d;
    const record = await prisma.discipline.upsert({
      where: { code: d.code },
      create: {
        ...rest,
        level: 'BACHELOR',
        departmentId: departmentByCode.get(departmentCode)!,
        programId: programByCode.get(programCode) ?? null,
      },
      update: {},
    });
    disciplineByCode.set(d.code, { id: record.id, credits: record.credits });
  }

  // ── Преподаватели и сотрудники ────────────────────────────────────────────
  const teacherByEmail = new Map<string, string>();

  for (const t of TEACHERS) {
    const iin = nextIin();
    const user = await prisma.user.upsert({
      where: { email: t.email },
      create: {
        email: t.email,
        passwordHash,
        iinEncrypted: encryptIin(iin),
        iinHash: hashIin(iin),
        lastNameKk: t.lastNameKk,
        firstNameKk: t.firstNameKk,
        middleNameKk: t.middleNameKk,
        lastNameRu: t.lastNameRu,
        firstNameRu: t.firstNameRu,
        middleNameRu: t.middleNameRu,
        lastNameEn: t.lastNameEn,
        firstNameEn: t.firstNameEn,
        uiLanguage: 'RU',
      },
      update: {},
    });

    for (const role of t.roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleId(role) } },
        create: { userId: user.id, roleId: roleId(role) },
        update: {},
      });
    }

    const profile = await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        departmentId: departmentByCode.get(t.departmentCode)!,
        position: t.position,
        academicDegree: t.academicDegree,
      },
      update: {},
    });
    teacherByEmail.set(t.email, profile.id);

    // Согласие на обработку ПДн для демо-учёток уже принято
    await prisma.consent.upsert({
      where: {
        userId_documentCode_version: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      },
      create: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      update: {},
    });
  }

  for (const s of STAFF) {
    const iin = nextIin();
    const user = await prisma.user.upsert({
      where: { email: s.email },
      create: {
        email: s.email,
        passwordHash,
        iinEncrypted: encryptIin(iin),
        iinHash: hashIin(iin),
        lastNameKk: s.lastNameKk,
        firstNameKk: s.firstNameKk,
        lastNameRu: s.lastNameRu,
        firstNameRu: s.firstNameRu,
        lastNameEn: s.lastNameEn,
        firstNameEn: s.firstNameEn,
        uiLanguage: 'RU',
      },
      update: {},
    });

    for (const role of s.roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleId(role) } },
        create: { userId: user.id, roleId: roleId(role) },
        update: {},
      });
    }

    // Методист связан с кафедрой через профиль преподавателя
    if ('departmentCode' in s && s.departmentCode) {
      await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          departmentId: departmentByCode.get(s.departmentCode)!,
          position: s.position ?? 'методист',
        },
        update: {},
      });
    }

    await prisma.consent.upsert({
      where: {
        userId_documentCode_version: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      },
      create: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      update: {},
    });
  }

  // ── Академические группы и контингент ─────────────────────────────────────
  const advisorId = teacherByEmail.get('g.tulegenova@demo.example.kz')!;

  const groups = await Promise.all(
    [
      { name: 'ИС-26-1', programCode: '6B06103', language: 'RU' as const },
      { name: 'ПИ-26-1', programCode: '6B06102', language: 'KK' as const },
    ].map((g) =>
      prisma.studyGroup.upsert({
        where: { programId_name: { programId: programByCode.get(g.programCode)!, name: g.name } },
        create: {
          programId: programByCode.get(g.programCode)!,
          name: g.name,
          studyYear: 1,
          language: g.language,
          studyForm: 'DISTANCE',
        },
        update: {},
      })
    )
  );

  const studentIds: string[] = [];

  for (const [index, name] of STUDENT_NAMES.entries()) {
    const [lastKk, firstKk, middleKk, lastRu, firstRu, middleRu] = name;
    const email = `${transliterate(firstRu).slice(0, 1)}.${transliterate(lastRu)}${index + 1}@demo.example.kz`;
    const group = groups[index % groups.length];
    const iin = nextIin();

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        iinEncrypted: encryptIin(iin),
        iinHash: hashIin(iin),
        lastNameKk: lastKk,
        firstNameKk: firstKk,
        middleNameKk: middleKk,
        lastNameRu: lastRu,
        firstNameRu: firstRu,
        middleNameRu: middleRu,
        lastNameEn: transliterate(lastRu).replace(/^./, (c) => c.toUpperCase()),
        firstNameEn: transliterate(firstRu).replace(/^./, (c) => c.toUpperCase()),
        uiLanguage: group.language,
      },
      update: {},
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleId('STUDENT') } },
      create: { userId: user.id, roleId: roleId('STUDENT') },
      update: {},
    });

    await prisma.consent.upsert({
      where: {
        userId_documentCode_version: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      },
      create: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      update: {},
    });

    const profile = await prisma.studentProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        programId: group.programId,
        groupId: group.id,
        advisorId,
        studyYear: 1,
        studyForm: 'DISTANCE',
        language: group.language,
        admissionYear: 2026,
        platonusId: `PLT-STU-${1000 + index}`,
      },
      update: {},
    });

    studentIds.push(profile.id);
  }

  // ── Курсы текущего периода ────────────────────────────────────────────────
  const courseSpecs = [
    { code: 'INF1201', teacher: 'a.nurgaliev@demo.example.kz', fill: true, publish: true },
    { code: 'INF2105', teacher: 'a.nurgaliev@demo.example.kz', fill: true, publish: true },
    { code: 'MAT1101', teacher: 'd.karimov@demo.example.kz', fill: false, publish: false },
    { code: 'MAT1203', teacher: 'd.karimov@demo.example.kz', fill: false, publish: false },
    { code: 'LAN1102', teacher: 'g.tulegenova@demo.example.kz', fill: false, publish: false },
  ];

  const courseByCode = new Map<string, string>();

  for (const spec of courseSpecs) {
    const discipline = disciplineByCode.get(spec.code)!;
    const slug = `${slugify(spec.code)}-2026-1`;

    const course = await prisma.course.upsert({
      // Составной unique [disciplineId, periodId, streamName] непригоден для upsert:
      // streamName здесь null, а Prisma не принимает null в compound unique input
      // (в SQL NULL != NULL, уникальность для null и не действует). slug детерминирован
      // и помечен @unique — по нему upsert идемпотентен.
      where: { slug },
      create: {
        disciplineId: discipline.id,
        periodId: period.id,
        slug,
        status: 'DRAFT',
        summaryRu:
          spec.code === 'INF1201'
            ? 'Дисциплина формирует базовое представление об информационных системах: назначении, классификации, жизненном цикле и требованиях. Итогом является фрагмент технического задания на учебную информационную систему.'
            : null,
        teachers: {
          create: { teacherId: teacherByEmail.get(spec.teacher)!, isLead: true },
        },
        questionBank: { create: {} },
      },
      update: {},
    });

    courseByCode.set(spec.code, course.id);
  }

  // ── Наполнение демонстрационного курса «Введение в ИС» ────────────────────
  const mainCourseId = courseByCode.get('INF1201')!;
  const existingModules = await prisma.module.count({ where: { courseId: mainCourseId } });

  if (existingModules === 0) {
    await prisma.syllabus.upsert({
      where: { courseId: mainCourseId },
      create: {
        courseId: mainCourseId,
        goals:
          'Сформировать у обучающихся системное представление об информационных системах: их назначении, классификации, жизненном цикле и требованиях к качеству. Подготовить к самостоятельному формулированию требований к информационной системе.',
        competencies:
          'Способность анализировать предметную область и формулировать требования к информационной системе; способность оценивать качество программного продукта по установленным критериям.',
        gradingCriteria:
          'Рубежный контроль 1 — тест (40 %) и задание (60 %).\nРубежный контроль 2 — тест (100 %).\nРейтинг допуска = (РК1 + РК2) / 2, минимум 50 баллов.\nИтоговый балл = рейтинг допуска × 0,6 + экзамен × 0,4.',
        policy:
          'Работы, сданные после установленного срока, принимаются со снижением балла на 10 % за каждый день просрочки, но не более чем на 50 %.\nПри обнаружении заимствования без ссылки на источник работа возвращается на доработку с обнулением балла за первую попытку.\nУчастие в учебном процессе подтверждается активностью в системе: просмотром материалов, выполнением заданий и прохождением тестов.',
        literature:
          '1. Приказ МНВО РК от 20.07.2022 № 2 «Об утверждении ГОСО высшего и послевузовского образования».\n2. Приказ МОН РК от 30.10.2018 № 595 «Об утверждении Типовых правил деятельности ОВПО».\n3. ГОСТ 34.601-90. Автоматизированные системы. Стадии создания.\n4. ISO/IEC 25010:2011. Systems and software Quality Requirements and Evaluation.',
        officeHours: 'Вторник, четверг 15:00–17:00 (онлайн)',
        contactInfo: 'a.nurgaliev@demo.example.kz',
      },
      update: {},
    });

    const quizItemIds: string[] = [];
    let assignmentItemId: string | null = null;

    for (const [mi, moduleSpec] of COURSE_INF1201_MODULES.entries()) {
      const createdModule = await prisma.module.create({
        data: {
          courseId: mainCourseId,
          title: moduleSpec.title,
          weekNumber: moduleSpec.weekNumber,
          orderIndex: mi,
        },
      });

      for (const [ii, itemSpec] of moduleSpec.items.entries()) {
        const item = await prisma.contentItem.create({
          data: {
            moduleId: createdModule.id,
            type: itemSpec.type,
            title: itemSpec.title,
            orderIndex: ii,
            plannedAcademicHours: itemSpec.hours,
            workType: itemSpec.workType,
            completionThreshold: 80,
            contentHtml:
              itemSpec.type === 'TEXT'
                ? `<h2>${itemSpec.title}</h2><p>Материал занятия. Плановая трудоёмкость — ${itemSpec.hours} академических часов.</p><p>Демонстрационное наполнение: в реальном курсе здесь размещается текст лекции, подготовленный преподавателем во встроенном редакторе, с таблицами, изображениями, формулами и вставками кода.</p><h3>Ключевые положения</h3><ul><li>Один академический кредит равен 30 академическим часам.</li><li>Освоенные часы засчитываются по факту работы с материалом.</li><li>Завершение элемента фиксируется при выполнении условия завершения.</li></ul>`
                : null,
            externalUrl: 'url' in itemSpec ? itemSpec.url : null,
            videoProvider: 'url' in itemSpec ? 'youtube' : null,
            videoId: 'url' in itemSpec ? 'dQw4w9WgXcQ' : null,
          },
        });

        if (itemSpec.type === 'QUIZ') {
          await prisma.quiz.create({
            data: {
              contentItemId: item.id,
              timeLimitMin: 40,
              maxAttempts: 2,
              passingScore: 50,
              gradingMethod: 'HIGHEST',
            },
          });
          quizItemIds.push(item.id);
        }

        if (itemSpec.type === 'ASSIGNMENT') {
          await prisma.assignment.create({
            data: {
              contentItemId: item.id,
              instructions:
                'Подготовьте фрагмент технического задания на учебную информационную систему: назначение, границы системы, три функциональных и два нефункциональных требования. Объём — 2–3 страницы. Формат файла — PDF или DOCX.',
              dueAt: new Date('2026-10-20T23:59:00'),
              maxScore: 100,
              allowLate: true,
              latePenaltyPerDay: 10,
              latePenaltyMax: 50,
              allowedExtensions: ['pdf', 'docx'],
              maxFileSizeMb: 20,
              maxFiles: 2,
            },
          });
          assignmentItemId = item.id;
        }
      }
    }

    // ── Банк вопросов ───────────────────────────────────────────────────────
    const bank = await prisma.questionBank.upsert({
      where: { courseId: mainCourseId },
      create: { courseId: mainCourseId },
      update: {},
    });

    const questionIds: string[] = [];

    for (const q of DEMO_QUESTIONS) {
      const topic = await prisma.questionTopic.upsert({
        where: { bankId_name: { bankId: bank.id, name: q.topic } },
        create: { bankId: bank.id, name: q.topic },
        update: {},
      });

      let options: { text: string; isCorrect: boolean; orderIndex: number; matchKey: string | null }[] = [];
      let payload: Record<string, unknown> = { partialCredit: true };

      if ('options' in q && q.options) {
        options = q.options.map((text, i) => ({
          text,
          isCorrect: (q.correct as number[]).includes(i + 1),
          orderIndex: i,
          matchKey: null,
        }));
      } else if ('pairs' in q && q.pairs) {
        options = q.pairs.map(([left, right], i) => ({
          text: left,
          isCorrect: true,
          orderIndex: i,
          matchKey: right,
        }));
      } else if ('sequence' in q && q.sequence) {
        options = q.sequence.map((text, i) => ({
          text,
          isCorrect: true,
          orderIndex: i,
          matchKey: String(i),
        }));
      } else if ('answers' in q && q.answers) {
        payload = { answers: q.answers, caseSensitive: false };
      }

      const created = await prisma.question.create({
        data: {
          bankId: bank.id,
          topicId: topic.id,
          type: q.type,
          difficulty: q.difficulty,
          text: q.text,
          explanation: 'explanation' in q ? q.explanation : null,
          defaultPoints: 1,
          payload: payload as never,
          options: { create: options },
        },
      });

      questionIds.push(created.id);
    }

    // Наполнение тестов вопросами (по 10 в каждом РК)
    const quizzes = await prisma.quiz.findMany({
      where: { contentItemId: { in: quizItemIds } },
      orderBy: { createdAt: 'asc' },
    });

    for (const [qi, quiz] of quizzes.entries()) {
      const slice = questionIds.slice(qi * 10, qi * 10 + 10);
      const chosen = slice.length >= 10 ? slice : questionIds.slice(0, 10);
      await prisma.quizQuestion.createMany({
        data: chosen.map((questionId, i) => ({
          quizId: quiz.id,
          questionId,
          points: 1,
          orderIndex: i,
        })),
        skipDuplicates: true,
      });
    }

    // ── Оценочные мероприятия ───────────────────────────────────────────────
    const quizByItem = new Map(quizzes.map((q) => [q.contentItemId, q.id]));
    const assignment = assignmentItemId
      ? await prisma.assignment.findUnique({ where: { contentItemId: assignmentItemId } })
      : null;

    const gradeItems = [
      {
        title: 'Тест РК1',
        controlPeriod: 'RK1' as const,
        maxScore: 100,
        weight: 40,
        quizId: quizByItem.get(quizItemIds[0]) ?? null,
      },
      {
        title: 'Задание: фрагмент ТЗ',
        controlPeriod: 'RK1' as const,
        maxScore: 100,
        weight: 60,
        assignmentId: assignment?.id ?? null,
      },
      {
        title: 'Тест РК2',
        controlPeriod: 'RK2' as const,
        maxScore: 100,
        weight: 100,
        quizId: quizByItem.get(quizItemIds[1]) ?? null,
      },
      { title: 'Экзамен', controlPeriod: 'EXAM' as const, maxScore: 100, weight: 100 },
    ];

    for (const [gi, gradeItem] of gradeItems.entries()) {
      await prisma.gradeItem.create({
        data: {
          courseId: mainCourseId,
          title: gradeItem.title,
          controlPeriod: gradeItem.controlPeriod,
          maxScore: gradeItem.maxScore,
          weight: gradeItem.weight,
          quizId: 'quizId' in gradeItem ? gradeItem.quizId : null,
          assignmentId: 'assignmentId' in gradeItem ? gradeItem.assignmentId : null,
          isAutoGraded: Boolean(
            ('quizId' in gradeItem && gradeItem.quizId) ||
              ('assignmentId' in gradeItem && gradeItem.assignmentId)
          ),
          orderIndex: gi,
        },
      });
    }
  }

  // ── Публикация курсов и регистрация студентов ─────────────────────────────
  for (const spec of courseSpecs.filter((s) => s.publish)) {
    const courseId = courseByCode.get(spec.code)!;
    await prisma.course.update({
      where: { id: courseId },
      data: { status: 'PUBLISHED', isPublic: true, publishedAt: new Date() },
    });

    for (const cp of ['RK1', 'RK2', 'EXAM'] as const) {
      await prisma.gradeSheet.upsert({
        where: { courseId_controlPeriod: { courseId, controlPeriod: cp } },
        create: {
          courseId,
          controlPeriod: cp,
          number: `${spec.code}-2026-1-${cp}`,
        },
        update: {},
      });
    }
  }

  const enrolledCourseIds = courseSpecs
    .filter((s) => s.publish)
    .map((s) => courseByCode.get(s.code)!);

  for (const courseId of enrolledCourseIds) {
    for (const studentId of studentIds) {
      await prisma.enrollment.upsert({
        where: { courseId_studentId: { courseId, studentId } },
        create: { courseId, studentId, source: 'manual' },
        update: {},
      });
    }
  }

  // ── Исходные строки прогресса ─────────────────────────────────────────────
  // В эксплуатации Progress создаётся при первой активности обучающегося
  // (recalculateCourseProgress). До этого сводка курса показывала бы
  // «0 из 0 элементов»: общее число элементов и плановых часов — свойство
  // курса, а не студента. Заполняем сразу, чтобы демонстрационные данные
  // отражали реальный объём курса.
  for (const courseId of enrolledCourseIds) {
    const [items, course] = await Promise.all([
      prisma.contentItem.findMany({
        where: { module: { courseId }, isPublished: true },
        select: { plannedAcademicHours: true },
      }),
      prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { discipline: { select: { credits: true } } },
      }),
    ]);

    const summary = summarizeProgress(
      items.map((i) => ({
        plannedAcademicHours: Number(i.plannedAcademicHours),
        completed: false,
        earnedHours: 0,
      })),
      course.discipline.credits
    );

    for (const studentId of studentIds) {
      await prisma.progress.upsert({
        where: { courseId_studentId: { courseId, studentId } },
        create: {
          courseId,
          studentId,
          completedItems: summary.completedItems,
          totalItems: summary.totalItems,
          earnedHours: summary.earnedHours,
          totalHours: summary.totalHours,
          percent: summary.percent,
        },
        // Обновляем только показатели курса: реальный прогресс обучающегося
        // при повторном запуске сида сбрасываться не должен.
        update: { totalItems: summary.totalItems, totalHours: summary.totalHours },
      });
    }
  }

  // ── Сопоставление идентификаторов для интеграции ──────────────────────────
  await prisma.integrationMapping.upsert({
    where: {
      entityType_internalId_system: {
        entityType: 'AcademicPeriod',
        internalId: period.id,
        system: 'platonus',
      },
    },
    create: {
      entityType: 'AcademicPeriod',
      internalId: period.id,
      externalId: 'PLT-PERIOD-2026-1',
      system: 'platonus',
    },
    update: {},
  });

  for (const [code, discipline] of disciplineByCode) {
    await prisma.integrationMapping.upsert({
      where: {
        entityType_internalId_system: {
          entityType: 'Discipline',
          internalId: discipline.id,
          system: 'platonus',
        },
      },
      create: {
        entityType: 'Discipline',
        internalId: discipline.id,
        externalId: `PLT-DISC-${code}`,
        system: 'platonus',
      },
      update: {},
    });
  }

  console.log(`   Пароль всех демонстрационных учётных записей: ${DEMO_PASSWORD}`);
  console.log('   admin@demo.example.kz — администратор');
  console.log('   registrar@demo.example.kz — офис регистратора');
  console.log('   methodist@demo.example.kz — методист кафедры');
  console.log('   a.nurgaliev@demo.example.kz — преподаватель (курс «Введение в ИС»)');
  console.log('   a.ahmetov1@demo.example.kz — обучающийся');
}
