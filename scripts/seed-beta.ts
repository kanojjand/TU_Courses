import { PrismaClient, type RoleCode } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { encryptIin, hashIin } from '@/lib/crypto';
import { slugify } from '@/lib/utils';

/**
 * Учётные записи для публичного бета-тестирования.
 *
 *   npm run db:seed:beta
 *
 * Десять независимых аккаунтов, покрывающих полный цикл работы платформы:
 * регистратор заводит курс → преподаватель наполняет → методист согласует →
 * администратор публикует и смотрит отчёты → обучающийся проходит.
 *
 * Скрипт идемпотентен: повторный запуск не создаёт дубликатов и не сбрасывает
 * то, что тестировщики успели наделать. Демонстрационные данные (prisma/seed.ts)
 * должны быть загружены до его запуска — он опирается на созданные там
 * кафедры, дисциплины, группы и академический период.
 *
 * Все персональные данные вымышлены.
 */

const BETA_PASSWORD = 'BetaTest2026!';
const BETA_DOMAIN = 'beta.example.kz';

interface BetaAccount {
  login: string;
  roles: RoleCode[];
  lastNameRu: string;
  firstNameRu: string;
  /** Код дисциплины для персонального курса преподавателя */
  courseDiscipline?: string;
  /** Публиковать курс сразу (иначе черновик — для проверки цикла согласования) */
  publishCourse?: boolean;
  /** Закрепить за эдвайзером обучающихся, иначе его список пуст */
  adviseeCount?: number;
  /** Назначить тьютором на курс указанного преподавателя */
  assistantOf?: string;
}

const ACCOUNTS: BetaAccount[] = [
  { login: 'beta01', roles: ['ADMIN'], lastNameRu: 'Тестов', firstNameRu: 'Администратор' },
  { login: 'beta02', roles: ['ADMIN'], lastNameRu: 'Тестова', firstNameRu: 'Администратор' },
  { login: 'beta03', roles: ['REGISTRAR'], lastNameRu: 'Тестов', firstNameRu: 'Регистратор' },
  { login: 'beta04', roles: ['REGISTRAR'], lastNameRu: 'Тестова', firstNameRu: 'Регистратор' },
  {
    login: 'beta05',
    roles: ['TEACHER'],
    lastNameRu: 'Тестов',
    firstNameRu: 'Преподаватель',
    courseDiscipline: 'INF2210',
    publishCourse: true,
  },
  {
    login: 'beta06',
    roles: ['TEACHER'],
    lastNameRu: 'Тестова',
    firstNameRu: 'Преподаватель',
    courseDiscipline: 'INF3301',
    publishCourse: true,
  },
  {
    login: 'beta07',
    roles: ['TEACHER'],
    lastNameRu: 'Тестов',
    firstNameRu: 'Наставник',
    courseDiscipline: 'INF3405',
  },
  {
    login: 'beta08',
    roles: ['TEACHER'],
    lastNameRu: 'Тестова',
    firstNameRu: 'Наставница',
    courseDiscipline: 'MAT1101',
  },
  { login: 'beta09', roles: ['METHODIST'], lastNameRu: 'Тестов', firstNameRu: 'Методист' },
  { login: 'beta10', roles: ['STUDENT'], lastNameRu: 'Тестов', firstNameRu: 'Обучающийся' },
  {
    login: 'beta11',
    roles: ['ADVISOR'],
    lastNameRu: 'Тестова',
    firstNameRu: 'Эдвайзер',
    adviseeCount: 12,
  },
  {
    login: 'beta12',
    roles: ['TUTOR'],
    lastNameRu: 'Тестов',
    firstNameRu: 'Тьютор',
    assistantOf: 'beta05',
  },
];

/**
 * Тот же алгоритм, что и в демонстрационных данных, но seed берётся из
 * непересекающегося диапазона — иначе ИИН бета-аккаунтов совпали бы
 * с демонстрационными и нарушили уникальность iinHash.
 */
function makeIin(seed: number): string | null {
  const base = String(10000000000 + ((seed * 7919) % 89999999999));
  const digits = base.split('').map(Number);
  const w1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const w2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];
  const sum = (w: number[]) => w.reduce((s, weight, i) => s + weight * digits[i], 0);
  let control = sum(w1) % 11;
  if (control === 10) control = sum(w2) % 11;
  if (control === 10) return null;
  return base + String(control);
}

/**
 * Содержимое курса beta07 — ровно 120 академических часов (4 кредита × 30).
 *
 * Допуск по часам в настройках равен нулю: объём курса должен совпадать с
 * объёмом дисциплины точно, иначе отправка на согласование и публикация
 * блокируются. Курс нужен наполненным, чтобы у методиста в очереди лежала
 * работоспособная заявка, а не пустой черновик.
 */
const BETA07_MODULES = [
  {
    title: 'Основы информационной безопасности',
    items: [
      { title: 'Угрозы, уязвимости, риски', hours: 4, workType: 'LECTURE' },
      { title: 'Модель нарушителя', hours: 4, workType: 'LECTURE' },
      { title: 'Практикум: построение модели угроз', hours: 6, workType: 'PRACTICE' },
      { title: 'СРО: анализ инцидента', hours: 10, workType: 'SRO' },
    ],
  },
  {
    title: 'Криптографические механизмы',
    items: [
      { title: 'Симметричное и асимметричное шифрование', hours: 4, workType: 'LECTURE' },
      { title: 'Практикум: работа с хеш-функциями', hours: 6, workType: 'PRACTICE' },
      { title: 'СРОП: разбор типовых ошибок', hours: 4, workType: 'SROP' },
      { title: 'СРО: сравнение алгоритмов', hours: 10, workType: 'SRO' },
    ],
  },
  {
    title: 'Управление доступом',
    items: [
      { title: 'Модели разграничения доступа', hours: 4, workType: 'LECTURE' },
      { title: 'Практикум: настройка ролевой модели', hours: 6, workType: 'PRACTICE' },
      { title: 'СРО: проектирование матрицы доступа', hours: 10, workType: 'SRO' },
      { title: 'Рубежный контроль 1', hours: 4, workType: 'PRACTICE' },
    ],
  },
  {
    title: 'Защита приложений и данных',
    items: [
      { title: 'Типовые уязвимости веб-приложений', hours: 4, workType: 'LECTURE' },
      { title: 'Лабораторная работа: разбор уязвимостей', hours: 6, workType: 'LAB' },
      { title: 'СРОП: защита промежуточных результатов', hours: 4, workType: 'SROP' },
      { title: 'СРО: аудит защищённости', hours: 10, workType: 'SRO' },
    ],
  },
  {
    title: 'Итоговая аттестация',
    items: [
      { title: 'Обзорная лекция к экзамену', hours: 4, workType: 'LECTURE' },
      { title: 'СРО: подготовка к экзамену', hours: 16, workType: 'SRO' },
      { title: 'Рубежный контроль 2', hours: 4, workType: 'PRACTICE' },
    ],
  },
] as const;

const prisma = new PrismaClient();

async function main() {
  if (!process.env.IIN_ENCRYPTION_KEY) {
    throw new Error('Не задан IIN_ENCRYPTION_KEY.');
  }

  const passwordHash = await bcrypt.hash(BETA_PASSWORD, 12);

  const roles = await prisma.role.findMany();
  if (roles.length === 0) {
    throw new Error('Справочники не загружены — сначала выполните npm run db:seed.');
  }
  const roleId = (code: RoleCode) => roles.find((r) => r.code === code)!.id;

  const period = await prisma.academicPeriod.findFirst({ where: { isCurrent: true } });
  if (!period) throw new Error('Не найден текущий академический период.');

  const department = await prisma.department.findFirst({ where: { code: 'CS' } });
  if (!department) throw new Error('Не найдена кафедра CS.');

  const group = await prisma.studyGroup.findFirst({ orderBy: { name: 'asc' } });
  if (!group) throw new Error('Не найдена учебная группа.');

  const advisor = await prisma.teacherProfile.findFirst();

  // Обучающиеся из демонстрационного набора — их регистрируем на бета-курсы,
  // иначе журнал оценок и аналитика у преподавателя окажутся пустыми.
  const demoStudents = await prisma.studentProfile.findMany({ take: 10, orderBy: { id: 'asc' } });
  const demoStudentsAll = await prisma.studentProfile.findMany({ orderBy: { id: 'asc' } });

  let iinSeed = 500_000;
  const usedIins = new Set<string>();
  const nextIin = (): string => {
    for (let guard = 0; guard < 10_000; guard += 1) {
      const iin = makeIin(iinSeed++);
      if (iin && !usedIins.has(iin)) {
        usedIins.add(iin);
        return iin;
      }
    }
    throw new Error('Не удалось сгенерировать уникальный ИИН.');
  };

  const created: { email: string; roles: string; note: string }[] = [];

  for (const acc of ACCOUNTS) {
    const email = `${acc.login}@${BETA_DOMAIN}`;
    const iin = nextIin();

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        iinEncrypted: encryptIin(iin),
        iinHash: hashIin(iin),
        lastNameRu: acc.lastNameRu,
        firstNameRu: acc.firstNameRu,
        lastNameKk: acc.lastNameRu,
        firstNameKk: acc.firstNameRu,
        lastNameEn: acc.login.toUpperCase(),
        firstNameEn: 'Beta',
        uiLanguage: 'RU',
      },
      // Пароль восстанавливаем при каждом запуске: тестировщик мог его сменить,
      // а раздаточный список должен оставаться верным.
      update: { passwordHash },
    });

    for (const role of acc.roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleId(role) } },
        create: { userId: user.id, roleId: roleId(role) },
        update: {},
      });
    }

    // Согласие на обработку ПДн — иначе первый вход упирается в баннер
    await prisma.consent.upsert({
      where: {
        userId_documentCode_version: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      },
      create: { userId: user.id, documentCode: 'PDP', version: '1.0' },
      update: {},
    });

    let note = '';

    // Методисту профиль преподавателя нужен ради кафедры: уведомления
    // о поступивших на согласование курсах адресуются методистам той кафедры,
    // к которой относится дисциплина (submitCourseForReview в server/courses.ts).
    if (acc.roles.includes('METHODIST')) {
      await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, departmentId: department.id, position: 'Методист кафедры' },
        update: {},
      });
      note = 'кафедра CS — получает курсы на согласование';
    }

    // Эдвайзер закрепляется за обучающимися через профиль преподавателя:
    // StudentProfile.advisorId ссылается на TeacherProfile, а не на User.
    if (acc.roles.includes('ADVISOR')) {
      const profile = await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, departmentId: department.id, position: 'Эдвайзер' },
        update: {},
      });

      const targets = demoStudentsAll.slice(0, acc.adviseeCount ?? 0);
      for (const st of targets) {
        await prisma.studentProfile.update({
          where: { id: st.id },
          data: { advisorId: profile.id },
        });
      }
      note = `${targets.length} подопечных`;
    }

    if (acc.roles.includes('TUTOR')) {
      const profile = await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, departmentId: department.id, position: 'Тьютор' },
        update: {},
      });

      if (acc.assistantOf) {
        const course = await prisma.course.findFirst({
          where: { slug: { contains: acc.assistantOf } },
          select: { id: true, discipline: { select: { code: true } } },
        });
        if (course) {
          await prisma.courseTeacher.upsert({
            where: { courseId_teacherId: { courseId: course.id, teacherId: profile.id } },
            create: { courseId: course.id, teacherId: profile.id, isAssistant: true },
            update: {},
          });
          note = `ассистент на курсе ${course.discipline.code}`;
        }
      }
    }

    if (acc.roles.includes('TEACHER')) {
      const profile = await prisma.teacherProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, departmentId: department.id, position: 'Преподаватель' },
        update: {},
      });

      if (acc.courseDiscipline) {
        const discipline = await prisma.discipline.findUnique({
          where: { code: acc.courseDiscipline },
        });

        if (discipline) {
          const slug = `${slugify(acc.courseDiscipline)}-beta-${acc.login}`;
          const course = await prisma.course.upsert({
            where: { slug },
            create: {
              disciplineId: discipline.id,
              periodId: period.id,
              // Поток разводит несколько курсов одной дисциплины в одном периоде
              streamName: `Бета ${acc.login}`,
              slug,
              status: acc.publishCourse ? 'PUBLISHED' : 'DRAFT',
              isPublic: acc.publishCourse ?? false,
              publishedAt: acc.publishCourse ? new Date() : null,
              teachers: { create: { teacherId: profile.id, isLead: true } },
              questionBank: { create: {} },
            },
            update: {},
          });

          for (const s of demoStudents) {
            await prisma.enrollment.upsert({
              where: { courseId_studentId: { courseId: course.id, studentId: s.id } },
              create: { courseId: course.id, studentId: s.id, source: 'beta' },
              update: {},
            });
          }

          // Курс beta07 наполняется и отправляется на согласование: иначе
          // очередь методиста пуста, и проверить его роль невозможно.
          if (acc.login === 'beta07') {
            const existing = await prisma.module.count({ where: { courseId: course.id } });
            if (existing === 0) {
              for (const [mi, m] of BETA07_MODULES.entries()) {
                const createdModule = await prisma.module.create({
                  data: {
                    courseId: course.id,
                    title: m.title,
                    weekNumber: mi + 1,
                    orderIndex: mi,
                  },
                });
                for (const [ii, item] of m.items.entries()) {
                  await prisma.contentItem.create({
                    data: {
                      moduleId: createdModule.id,
                      type: 'TEXT',
                      title: item.title,
                      orderIndex: ii,
                      plannedAcademicHours: item.hours,
                      workType: item.workType,
                      completionThreshold: 80,
                      contentHtml: `<h2>${item.title}</h2><p>Демонстрационное наполнение. Плановая трудоёмкость — ${item.hours} академических часов.</p>`,
                    },
                  });
                }
              }
              await prisma.course.update({
                where: { id: course.id },
                data: { status: 'ON_REVIEW', submittedAt: new Date() },
              });
            }
          }

          const state =
            acc.login === 'beta07'
              ? 'на согласовании, 120 ч'
              : acc.publishCourse
                ? 'опубликован'
                : 'черновик';
          note = `курс ${acc.courseDiscipline} — ${state}, ${demoStudents.length} студентов`;
        }
      }
    }

    if (acc.roles.includes('STUDENT')) {
      const profile = await prisma.studentProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          programId: group.programId,
          groupId: group.id,
          advisorId: advisor?.id ?? null,
          studyYear: 1,
          studyForm: 'DISTANCE',
          language: group.language,
          admissionYear: 2026,
        },
        update: {},
      });

      // Регистрируем на все опубликованные курсы периода, чтобы кабинет не пустовал
      const published = await prisma.course.findMany({
        where: { status: 'PUBLISHED', periodId: period.id },
        select: { id: true },
      });
      for (const c of published) {
        await prisma.enrollment.upsert({
          where: { courseId_studentId: { courseId: c.id, studentId: profile.id } },
          create: { courseId: c.id, studentId: profile.id, source: 'beta' },
          update: {},
        });
      }
      note = `зарегистрирован на ${published.length} курсов`;
    }

    created.push({ email, roles: acc.roles.join('+'), note });
  }

  console.log(`\nПароль всех бета-аккаунтов: ${BETA_PASSWORD}\n`);
  console.log('E-MAIL'.padEnd(28) + 'РОЛЬ'.padEnd(14) + 'ПРИМЕЧАНИЕ');
  console.log('-'.repeat(92));
  for (const c of created) {
    console.log(c.email.padEnd(28) + c.roles.padEnd(14) + c.note);
  }
  console.log(`\nВсего аккаунтов: ${created.length}`);
}

main()
  .catch((error) => {
    console.error('Ошибка:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
