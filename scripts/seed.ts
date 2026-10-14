/**
 * Демо-данные для показа и проверки: оргструктура, роли, потоки, курс
 * с видео, тестом и заданием, прогресс и оценки студентов.
 *
 *   DATABASE_URL=... npm run db:seed            — заполнить пустую базу
 *   DATABASE_URL=... npm run db:seed -- --reset — очистить LMS и заполнить заново
 *
 * На боевой базе не запускать: контент и студенты приходят из импорта.
 */
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as s from '../src/db/schema';

const client = postgres(process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/tu_online', { prepare: false, max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: 'snake_case' });

const DEMO_PASSWORD = 'demo12345';
const at = (iso: string) => new Date(iso);
let seedState = 42;
const rnd = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};

async function reset() {
  const tables = await client<{ t: string }[]>`select tablename as t from pg_tables where schemaname = 'lms'`;
  const names = tables.map((r) => `lms."${r.t}"`).join(', ');
  if (names) await client.unsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

async function main() {
  if (process.argv.includes('--reset')) await reset();
  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.log('В базе уже есть пользователи — пропускаю. Для пересоздания: --reset');
    return;
  }
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  /* ── Схема оценивания и календарь ── */
  const [scheme] = await db
    .insert(s.gradeSchemes)
    .values({ title: 'Академическая политика 2026–2027', isDefault: true, currentWeight: 0.6, admissionThreshold: 50, lateRule: 'penalty', latePenaltyPct: 20, videoThreshold: 90, rk1Week: 7, rk2Week: 15 })
    .returning();
  const [year] = await db.insert(s.academicYears).values({ title: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-06-30', isCurrent: true }).returning();
  const [p1] = await db
    .insert(s.academicPeriods)
    .values({ yearId: year.id, number: 1, kind: 'semester', code: '2026-2027-1', startsOn: '2026-09-01', endsOn: '2027-01-15', isCurrent: true })
    .returning();
  await db.insert(s.academicPeriods).values({ yearId: year.id, number: 2, kind: 'semester', code: '2026-2027-2', startsOn: '2027-01-20', endsOn: '2027-06-10' });
  const win = (kind: s.WindowKind, a: string, b: string) => ({ periodId: p1.id, kind, startsAt: at(`${a}T00:00:00+05:00`), endsAt: at(`${b}T23:59:00+05:00`) });
  await db.insert(s.calendarWindows).values([
    win('registration', '2026-08-20', '2026-09-05'),
    win('rk1', '2026-10-19', '2026-10-31'),
    win('grading_rk1', '2026-10-26', '2026-11-07'),
    win('rk2', '2026-12-07', '2026-12-19'),
    win('grading_rk2', '2026-12-14', '2026-12-26'),
    win('session', '2026-12-28', '2027-01-10'),
    win('grading_exam', '2026-12-28', '2027-01-14'),
  ]);

  /* ── Оргструктура ── */
  const [fit, fel, fhp] = await db
    .insert(s.faculties)
    .values([
      { code: 'FIT', nameKk: 'Ақпараттық технологиялар және инженерия факультеті', nameRu: 'Факультет информационных технологий и инженерии', nameEn: 'Faculty of IT and Engineering' },
      { code: 'FEL', nameKk: 'Экономика және құқық факультеті', nameRu: 'Факультет экономики и права', nameEn: 'Faculty of Economics and Law' },
      { code: 'FHP', nameKk: 'Гуманитарлық-педагогикалық факультет', nameRu: 'Гуманитарно-педагогический факультет', nameEn: 'Faculty of Humanities and Education' },
    ])
    .returning();
  const [dIS, dCE, dEC, dPP] = await db
    .insert(s.departments)
    .values([
      { facultyId: fit.id, code: 'IS', nameKk: 'Ақпараттық жүйелер кафедрасы', nameRu: 'Кафедра информационных систем', nameEn: 'Department of Information Systems' },
      { facultyId: fit.id, code: 'CE', nameKk: 'Құрылыс және инженерия кафедрасы', nameRu: 'Кафедра строительства и инженерии', nameEn: 'Department of Civil Engineering' },
      { facultyId: fel.id, code: 'EC', nameKk: 'Экономика кафедрасы', nameRu: 'Кафедра экономики', nameEn: 'Department of Economics' },
      { facultyId: fhp.id, code: 'PP', nameKk: 'Педагогика және психология кафедрасы', nameRu: 'Кафедра педагогики и психологии', nameEn: 'Department of Pedagogy and Psychology' },
    ])
    .returning();
  const [pIS, pEC, pPP] = await db
    .insert(s.programs)
    .values([
      { code: '6B06101', departmentId: dIS.id, degree: 'bachelor', nameKk: 'Ақпараттық жүйелер', nameRu: 'Информационные системы', nameEn: 'Information Systems' },
      { code: '6B04101', departmentId: dEC.id, degree: 'bachelor', nameKk: 'Экономика', nameRu: 'Экономика', nameEn: 'Economics' },
      { code: '6B01101', departmentId: dPP.id, degree: 'bachelor', nameKk: 'Педагогика және психология', nameRu: 'Педагогика и психология', nameEn: 'Pedagogy and Psychology' },
    ])
    .returning();
  const [gIS1, gIS2, gEC1, gPP1] = await db
    .insert(s.studyGroups)
    .values([
      { code: 'ИС-25-1', programId: pIS.id, courseYear: 2, studyLang: 'ru', studyForm: 'full_time' },
      { code: 'ИС-25-2К', programId: pIS.id, courseYear: 2, studyLang: 'kk', studyForm: 'full_time' },
      { code: 'ЭК-25-1', programId: pEC.id, courseYear: 2, studyLang: 'ru', studyForm: 'distance' },
      { code: 'ПП-25-1', programId: pPP.id, courseYear: 2, studyLang: 'kk', studyForm: 'full_time' },
    ])
    .returning();
  void dCE;

  /* ── Сотрудники и роли ── */
  type Staff = { login: string; last: string; first: string; middle?: string; dep?: string; position?: string; roles: { role: s.Role; scopeType?: s.ScopeType; scopeId?: string | null }[]; pid?: string };
  const staffList: Staff[] = [
    { login: 'admin', last: 'Администратор', first: 'Системы', roles: [{ role: 'admin' }] },
    { login: 'registrar', last: 'Жумабаева', first: 'Сауле', middle: 'Ериковна', position: 'Офис регистратора', roles: [{ role: 'registrar' }] },
    { login: 'uchchast', last: 'Ким', first: 'Елена', middle: 'Викторовна', position: 'Учебная часть', roles: [{ role: 'academic_office' }] },
    { login: 'rector', last: 'Ташенев', first: 'Ерлан', middle: 'Маратович', position: 'Проректор', roles: [{ role: 'rector' }] },
    { login: 'dekan', last: 'Омаров', first: 'Бауыржан', middle: 'Кайратович', position: 'Декан', roles: [{ role: 'dean', scopeType: 'faculty', scopeId: fit.id }] },
    {
      login: 'kafedra',
      last: 'Сейтказиева',
      first: 'Гульнара',
      middle: 'Абаевна',
      dep: dIS.id,
      position: 'Заведующая кафедрой',
      pid: 'T1000',
      roles: [{ role: 'dept_head', scopeType: 'department', scopeId: dIS.id }, { role: 'teacher', scopeType: 'department', scopeId: dIS.id }],
    },
    {
      login: 'teacher',
      last: 'Ахметова',
      first: 'Айгерим',
      middle: 'Болатовна',
      dep: dIS.id,
      position: 'Старший преподаватель',
      pid: 'T1001',
      roles: [{ role: 'teacher', scopeType: 'department', scopeId: dIS.id }, { role: 'author', scopeType: 'department', scopeId: dIS.id }],
    },
    { login: 'teacher2', last: 'Петров', first: 'Игорь', middle: 'Сергеевич', dep: dIS.id, position: 'Доцент', pid: 'T1002', roles: [{ role: 'teacher', scopeType: 'department', scopeId: dIS.id }] },
    { login: 'teacher3', last: 'Нурланова', first: 'Динара', dep: dEC.id, position: 'Преподаватель', pid: 'T1003', roles: [{ role: 'teacher', scopeType: 'department', scopeId: dEC.id }] },
    { login: 'author', last: 'Бекова', first: 'Мадина', middle: 'Аскаровна', dep: dIS.id, position: 'Методист', roles: [{ role: 'author', scopeType: 'department', scopeId: dIS.id }] },
    { login: 'advisor', last: 'Каримов', first: 'Тимур', middle: 'Русланович', dep: dIS.id, position: 'Эдвайзер', roles: [{ role: 'advisor', scopeType: 'group', scopeId: gIS1.id }, { role: 'advisor', scopeType: 'group', scopeId: gIS2.id }] },
  ];
  const ids: Record<string, string> = {};
  for (const st of staffList) {
    const [u] = await db
      .insert(s.users)
      .values({ login: st.login, lastName: st.last, firstName: st.first, middleName: st.middle ?? null, email: `${st.login}@tashenev.edu.kz`, passwordHash: hash, mustChangePassword: false, locale: 'ru' })
      .returning();
    ids[st.login] = u.id;
    if (st.dep || st.position) await db.insert(s.staff).values({ userId: u.id, departmentId: st.dep ?? null, position: st.position ?? null });
    if (st.pid) await db.insert(s.externalIds).values({ entityType: 'teacher', lmsId: u.id, externalId: st.pid });
    for (const r of st.roles)
      await db.insert(s.userRoles).values({ userId: u.id, role: r.role, scopeType: r.scopeType ?? 'university', scopeId: r.scopeId ?? null });
  }

  /* ── Студенты ── */
  const ruNames = [
    ['Иванов', 'Алексей'],
    ['Смирнова', 'Анна'],
    ['Ким', 'Денис'],
    ['Абдрахманова', 'Алина'],
    ['Петренко', 'Максим'],
    ['Сулейменов', 'Арман'],
    ['Волкова', 'Мария'],
    ['Тен', 'Виктория'],
    ['Джаксыбеков', 'Ильяс'],
    ['Кузнецова', 'Ольга'],
    ['Бекмуратов', 'Данияр'],
  ];
  const kkNames = [
    ['Серікұлы', 'Нұрлан'],
    ['Әбілқасымова', 'Жансая'],
    ['Төлеуов', 'Ерасыл'],
    ['Қайратқызы', 'Аружан'],
    ['Мұратов', 'Әлібек'],
    ['Оразбаева', 'Гүлнұр'],
    ['Жақсылықов', 'Бекзат'],
    ['Нұрғалиева', 'Дана'],
    ['Есенов', 'Темірлан'],
  ];
  const studentIds: Record<string, string[]> = { [gIS1.id]: [], [gIS2.id]: [], [gEC1.id]: [], [gPP1.id]: [] };
  let n = 1;
  async function addStudent(last: string, first: string, group: typeof gIS1, login?: string) {
    const pid = `S25${String(n).padStart(4, '0')}`;
    n++;
    const [u] = await db
      .insert(s.users)
      .values({
        login: login ?? pid.toLowerCase(),
        lastName: last,
        firstName: first,
        email: `${(login ?? pid).toLowerCase()}@stud.tashenev.edu.kz`,
        passwordHash: hash,
        mustChangePassword: false,
        locale: group.studyLang,
      })
      .returning();
    await db.insert(s.students).values({ userId: u.id, groupId: group.id, courseYear: group.courseYear, studyForm: group.studyForm, studyLang: group.studyLang, status: 'studying' });
    await db.insert(s.externalIds).values({ entityType: 'student', lmsId: u.id, externalId: pid });
    await db.insert(s.userRoles).values({ userId: u.id, role: 'student', scopeType: 'university' });
    studentIds[group.id].push(u.id);
    return u.id;
  }
  ids.student = await addStudent('Сапаров', 'Ержан', gIS1, 'student');
  for (const [l, f] of ruNames) await addStudent(l, f, gIS1);
  for (const [l, f] of kkNames) await addStudent(l, f, gIS2);
  for (const [l, f] of ruNames.slice(0, 6)) await addStudent(l + (l.endsWith('а') ? '' : ''), f, gEC1);
  for (const [l, f] of kkNames.slice(0, 6)) await addStudent(l, f, gPP1);

  /* ── Дисциплины и потоки ── */
  const [oop, dbd, web, mic, psy] = await db
    .insert(s.disciplines)
    .values([
      { code: 'OOP2201', departmentId: dIS.id, credits: 5, nameKk: 'Объектіге бағытталған бағдарламалау', nameRu: 'Объектно-ориентированное программирование', nameEn: 'Object-Oriented Programming' },
      { code: 'DB2202', departmentId: dIS.id, credits: 5, nameKk: 'Деректер қоры', nameRu: 'Базы данных', nameEn: 'Databases' },
      { code: 'WEB2203', departmentId: dIS.id, credits: 5, nameKk: 'Веб-әзірлеу', nameRu: 'Веб-разработка', nameEn: 'Web Development' },
      { code: 'MIC2101', departmentId: dEC.id, credits: 5, nameKk: 'Микроэкономика', nameRu: 'Микроэкономика', nameEn: 'Microeconomics' },
      { code: 'PSY2101', departmentId: dPP.id, credits: 4, nameKk: 'Жалпы психология', nameRu: 'Общая психология', nameEn: 'General Psychology' },
    ])
    .returning();
  const off = async (d: typeof oop, lessonType: s.LessonType, stream: string, language: 'kk' | 'ru', teacher: string) =>
    (await db.insert(s.offerings).values({ disciplineId: d.id, periodId: p1.id, lessonType, stream, language, teacherId: ids[teacher], gradeSchemeId: scheme.id }).returning())[0];
  const oopL = await off(oop, 'lecture', 'OOP-L-01', 'ru', 'kafedra');
  const oopP1 = await off(oop, 'practice', 'OOP-P-01', 'ru', 'teacher');
  const oopKk = await off(oop, 'practice', 'OOP-P-02К', 'kk', 'teacher');
  const dbL = await off(dbd, 'lecture', 'DB-L-01', 'ru', 'teacher2');
  const webP = await off(web, 'practice', 'WEB-P-01', 'ru', 'teacher');
  const micL = await off(mic, 'lecture', 'MIC-L-01', 'ru', 'teacher3');
  const psyL = await off(psy, 'lecture', 'PSY-L-01', 'kk', 'teacher3');
  const enroll = async (o: typeof oopL, list: string[]) => {
    if (list.length) await db.insert(s.enrollments).values(list.map((studentId) => ({ studentId, offeringId: o.id, source: 'platonus_file' as const })));
  };
  await enroll(oopL, studentIds[gIS1.id]);
  await enroll(oopP1, studentIds[gIS1.id]);
  await enroll(oopKk, studentIds[gIS2.id]);
  await enroll(dbL, [...studentIds[gIS1.id], ...studentIds[gIS2.id]]);
  await enroll(webP, studentIds[gIS1.id]);
  await enroll(micL, studentIds[gEC1.id]);
  await enroll(psyL, studentIds[gPP1.id]);

  /* ── Курс ООП: опубликован, с видео, текстом, тестом и заданием ── */
  const [course] = await db
    .insert(s.courses)
    .values({
      disciplineId: oop.id,
      language: 'ru',
      title: 'Объектно-ориентированное программирование',
      description: 'Классы и объекты, инкапсуляция, наследование, полиморфизм и принципы проектирования на примерах Java и Python.',
      ownerId: ids.teacher,
      status: 'draft',
    })
    .returning();
  await db.insert(s.courseAuthors).values([
    { courseId: course.id, userId: ids.teacher, assignedBy: ids.kafedra },
    { courseId: course.id, userId: ids.author, assignedBy: ids.kafedra },
  ]);
  const sampleVideos = [
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  ];
  let vi = 0;
  async function videoBlock(title: string) {
    const url = sampleVideos[vi++ % sampleVideos.length];
    const [m] = await db
      .insert(s.mediaAssets)
      .values({ provider: 'external', url, filename: url.split('/').pop(), durationSec: 15, status: 'ready', ownerId: ids.teacher, courseId: course.id })
      .returning();
    return { type: 'video' as const, title, required: true, data: { mediaId: m.id } };
  }
  const text = (title: string, html: string) => ({ type: 'text' as const, title, required: false, data: { html } });
  const link = (title: string, url: string, description?: string) => ({ type: 'link' as const, title, required: false, data: { url, description } });

  const plan: { week: number; title: string; lessons: { title: string; min: number; blocks: (() => Promise<{ type: s.BlockType; title: string; required: boolean; data: s.BlockData }>)[] }[] }[] = [
    {
      week: 1,
      title: 'Введение в ООП',
      lessons: [
        {
          title: 'Что такое ООП и зачем оно нужно',
          min: 25,
          blocks: [
            () => videoBlock('Лекция 1. Парадигмы программирования (демо-видео)'),
            async () =>
              text(
                'Конспект',
                '<h2>Парадигмы программирования</h2><p>Процедурный подход описывает программу как последовательность действий. <strong>Объектно-ориентированный</strong> — как набор объектов, которые хранят состояние и обмениваются сообщениями.</p><ul><li><strong>Объект</strong> — данные + поведение.</li><li><strong>Класс</strong> — шаблон, по которому создаются объекты.</li><li><strong>Сообщение</strong> — вызов метода объекта.</li></ul><p>ООП помогает разбивать большую систему на понятные части и повторно использовать код.</p>',
              ),
          ],
        },
        {
          title: 'Классы и объекты',
          min: 30,
          blocks: [
            () => videoBlock('Лекция 2. Классы и объекты (демо-видео)'),
            async () =>
              text(
                'Пример на Python',
                '<p>Класс описывает, какие поля и методы будут у объекта:</p><pre><code>class Student:\n    def __init__(self, name, group):\n        self.name = name\n        self.group = group\n\n    def greet(self):\n        return f"Привет, я {self.name} из {self.group}"\n\ns = Student("Айгерим", "ИС-25-1")\nprint(s.greet())</code></pre>',
              ),
            async () => link('Документация Python: классы', 'https://docs.python.org/3/tutorial/classes.html', 'Официальный учебник, раздел 9'),
          ],
        },
      ],
    },
    {
      week: 2,
      title: 'Инкапсуляция',
      lessons: [
        {
          title: 'Скрытие данных и свойства',
          min: 30,
          blocks: [
            () => videoBlock('Лекция 3. Инкапсуляция (демо-видео)'),
            async () =>
              text(
                'Главное',
                '<p>Инкапсуляция — объект сам отвечает за своё состояние. Снаружи доступны только методы, внутренние поля скрыты.</p><blockquote>Правило: меняйте состояние объекта только через его методы.</blockquote>',
              ),
          ],
        },
        { title: 'Проверка: основы ООП', min: 15, blocks: [async () => ({ type: 'quiz', title: 'Тест по модулям 1–2', required: true, data: {} })] },
      ],
    },
    {
      week: 3,
      title: 'Наследование и полиморфизм',
      lessons: [
        {
          title: 'Наследование',
          min: 35,
          blocks: [
            () => videoBlock('Лекция 4. Наследование (демо-видео)'),
            async () => text('Конспект', '<p>Наследование позволяет создать новый класс на основе существующего и переиспользовать его поведение.</p><pre><code>class Animal:\n    def speak(self): return "..."\n\nclass Dog(Animal):\n    def speak(self): return "Гав"</code></pre>'),
          ],
        },
        {
          title: 'Полиморфизм',
          min: 30,
          blocks: [
            () => videoBlock('Лекция 5. Полиморфизм (демо-видео)'),
            async () => text('Конспект', '<p>Полиморфизм — один интерфейс, разные реализации. Код работает с базовым типом и не знает, какой именно объект пришёл.</p>'),
          ],
        },
        {
          title: 'Лабораторная работа 1',
          min: 90,
          blocks: [async () => ({ type: 'assignment', title: 'Лабораторная работа 1: иерархия классов', required: true, data: {} })],
        },
      ],
    },
    {
      week: 4,
      title: 'Онлайн-занятие и итоги модуля',
      lessons: [
        {
          title: 'Консультация в Zoom',
          min: 60,
          blocks: [async () => link('Подключиться к занятию', 'https://zoom.us/j/0000000000', 'Каждую среду в 18:00. Запись появится в уроке.')],
        },
      ],
    },
  ];

  let quizBlockId = '';
  let assignmentBlockId = '';
  for (const [mi, m] of plan.entries()) {
    const [mod] = await db.insert(s.modules).values({ courseId: course.id, week: m.week, position: mi, title: m.title }).returning();
    for (const [li, l] of m.lessons.entries()) {
      const [les] = await db.insert(s.lessons).values({ moduleId: mod.id, position: li, title: l.title, required: true, estMinutes: l.min }).returning();
      for (const [bi, make] of l.blocks.entries()) {
        const b = await make();
        const [blk] = await db.insert(s.lessonBlocks).values({ lessonId: les.id, position: bi, ...b }).returning();
        if (b.type === 'quiz') quizBlockId = blk.id;
        if (b.type === 'assignment') assignmentBlockId = blk.id;
      }
    }
  }

  // Банк вопросов и тест
  const [bank] = await db.insert(s.questionBanks).values({ courseId: course.id, title: 'Основы ООП' }).returning();
  const qs: { type: s.QuestionType; text: string; d: number; options?: [string, boolean, string?][]; answers?: string[] }[] = [
    { type: 'single', d: 1, text: 'Что такое класс?', options: [['Шаблон для создания объектов', true], ['Переменная', false], ['Цикл', false], ['Файл программы', false]] },
    { type: 'single', d: 1, text: 'Как называется экземпляр класса?', options: [['Объект', true], ['Метод', false], ['Модуль', false]] },
    { type: 'single', d: 1, text: 'Какой принцип ООП отвечает за скрытие внутреннего состояния?', options: [['Инкапсуляция', true], ['Наследование', false], ['Полиморфизм', false]] },
    { type: 'single', d: 1, text: 'В Python метод-конструктор называется…', options: [['__init__', true], ['constructor', false], ['new', false], ['init', false]] },
    { type: 'multiple', d: 1, text: 'Выберите принципы ООП', options: [['Инкапсуляция', true], ['Наследование', true], ['Полиморфизм', true], ['Компиляция', false]] },
    { type: 'short', d: 1, text: 'Как называется функция, объявленная внутри класса? (одно слово)', answers: ['метод', 'method'] },
    { type: 'single', d: 2, text: 'Что выведет вызов Dog().speak(), если Dog наследует Animal и переопределяет speak()?', options: [['Результат метода Dog', true], ['Результат метода Animal', false], ['Ошибку', false]] },
    { type: 'matching', d: 2, text: 'Сопоставьте понятие и определение', options: [['Класс', true, 'Шаблон объекта'], ['Объект', true, 'Экземпляр класса'], ['Метод', true, 'Функция внутри класса']] },
    { type: 'ordering', d: 2, text: 'Расположите шаги создания объекта по порядку', options: [['Описать класс', true], ['Вызвать конструктор', true], ['Использовать методы объекта', true]] },
    { type: 'multiple', d: 2, text: 'Что верно про инкапсуляцию?', options: [['Состояние меняется через методы', true], ['Поля можно скрыть', true], ['Все поля всегда публичные', false]] },
    { type: 'single', d: 3, text: 'Какой принцип нарушается, если подкласс не может заменить базовый класс без ошибок?', options: [['Принцип подстановки Лисков', true], ['Принцип единственной ответственности', false], ['DRY', false]] },
    { type: 'single', d: 3, text: 'Что предпочтительнее для повторного использования поведения при слабой связности?', options: [['Композиция', true], ['Глубокое наследование', false], ['Глобальные переменные', false]] },
  ];
  for (const q of qs) {
    const [row] = await db.insert(s.questions).values({ bankId: bank.id, type: q.type, text: q.text, difficulty: q.d, data: q.answers ? { answers: q.answers } : {} }).returning();
    if (q.options)
      await db.insert(s.questionOptions).values(q.options.map(([t, c, m], i) => ({ questionId: row.id, text: t, isCorrect: c, matchText: m ?? null, position: i })));
  }
  const [quiz] = await db
    .insert(s.quizzes)
    .values({ blockId: quizBlockId, bankId: bank.id, countEasy: 5, countMedium: 3, countHard: 1, timeLimitMin: 20, attemptsAllowed: 2, shuffle: true })
    .returning();
  const [assignment] = await db
    .insert(s.assignments)
    .values({
      blockId: assignmentBlockId,
      maxScore: 100,
      instructions: 'Спроектируйте иерархию из трёх классов (базовый класс и два наследника) для предметной области «Университет». Приложите код и короткое описание.',
      criteria: 'Корректность иерархии — 40, переопределение методов — 30, оформление кода — 20, описание — 10.',
      allowedExt: 'pdf,docx,zip,py,java,txt',
    })
    .returning();

  // Шаблон курса от учебной части и черновики
  await db.insert(s.courses).values([
    { title: 'Шаблон курса на 15 недель', language: 'ru', status: 'published', isTemplate: true, ownerId: ids.uchchast, description: 'Недели 1–15, точки РК1 (неделя 7) и РК2 (неделя 15).' },
    { disciplineId: dbd.id, language: 'ru', title: 'Базы данных', status: 'review', ownerId: ids.author, description: 'Реляционная модель, SQL, проектирование схем.' },
    { disciplineId: web.id, language: 'ru', title: 'Веб-разработка', status: 'draft', ownerId: ids.teacher, description: 'HTML, CSS, JavaScript и основы бэкенда.' },
  ]);
  const created = await db.select().from(s.courses);
  for (const c of created.filter((c) => !c.isTemplate && c.id !== course.id))
    await db.insert(s.courseAuthors).values({ courseId: c.id, userId: c.ownerId!, assignedBy: ids.kafedra }).onConflictDoNothing();
  const tpl = created.find((c) => c.isTemplate)!;
  for (let w = 1; w <= 15; w++) {
    await db.insert(s.modules).values({ courseId: tpl.id, week: w, position: w - 1, title: w === 7 ? `Неделя ${w}. Рубежный контроль 1` : w === 15 ? `Неделя ${w}. Рубежный контроль 2` : `Неделя ${w}` });
  }
  const dbCourse = created.find((c) => c.title === 'Базы данных')!;
  const [dbm] = await db.insert(s.modules).values({ courseId: dbCourse.id, week: 1, position: 0, title: 'Реляционная модель' }).returning();
  await db.insert(s.lessons).values([
    { moduleId: dbm.id, position: 0, title: 'Таблицы, ключи, связи', estMinutes: 30 },
    { moduleId: dbm.id, position: 1, title: 'Нормализация', estMinutes: 40 },
  ]);

  // Публикация ООП: снимок версии и подключение к потокам
  await publishDirect(course.id, ids.kafedra, oop.id);

  /* ── Элементы оценивания и привязки ── */
  for (const o of [oopL, oopP1, oopKk, dbL, webP, micL, psyL]) await createItems(o.id, p1.id);
  const items = await db.select().from(s.gradeItems).where(eq(s.gradeItems.offeringId, oopP1.id));
  const tk1 = items.find((i) => i.component === 'TK1')!;
  const [tkQuiz] = await db
    .insert(s.gradeItems)
    .values({ offeringId: oopP1.id, component: 'TK1', title: 'Тест по модулям 1–2', blockId: quizBlockId, opensAt: at('2026-09-01T00:00:00+05:00'), dueAt: at('2026-10-20T23:59:00+05:00'), hardCloseAt: at('2026-11-07T23:59:00+05:00'), position: 1 })
    .returning();
  const [tkLab] = await db
    .insert(s.gradeItems)
    .values({ offeringId: oopP1.id, component: 'TK1', title: 'Лабораторная работа 1', blockId: assignmentBlockId, opensAt: at('2026-09-01T00:00:00+05:00'), dueAt: at('2026-10-12T23:59:00+05:00'), hardCloseAt: at('2026-11-07T23:59:00+05:00'), position: 2 })
    .returning();
  await db.delete(s.gradeItems).where(eq(s.gradeItems.id, tk1.id));

  /* ── Прогресс, попытки, сдачи, оценки ── */
  const snap = (await db.select().from(s.courseVersions).where(eq(s.courseVersions.courseId, course.id)))[0].snapshot as {
    modules: { week: number; lessons: { id: string; blocks: { id: string; type: string }[] }[] }[];
  };
  const allLessons = snap.modules.flatMap((m) => m.lessons);
  const group1 = studentIds[gIS1.id];
  const questionsRows = await db.select().from(s.questions).where(eq(s.questions.bankId, bank.id));
  for (const [idx, sid] of group1.entries()) {
    const isDemo = sid === ids.student;
    const share = isDemo ? 0.45 : idx % 4 === 3 ? 0.15 : 0.35 + rnd() * 0.65;
    const doneCount = Math.max(0, Math.min(allLessons.length, Math.round(allLessons.length * share)));
    for (const [li, l] of allLessons.entries()) {
      if (li > doneCount) break;
      const completed = li < doneCount;
      await db.insert(s.lessonProgress).values({
        studentId: sid,
        offeringId: oopP1.id,
        lessonId: l.id,
        status: completed ? 'completed' : 'in_progress',
        completedAt: completed ? at(`2026-09-${String(5 + li * 3).padStart(2, '0')}T12:00:00+05:00`) : null,
        lastSeenAt: at(`2026-10-${String(1 + Math.min(li, 12)).padStart(2, '0')}T18:00:00+05:00`),
      });
      for (const b of l.blocks.filter((b) => b.type === 'video')) {
        const pct = completed ? 100 : 40;
        await db.insert(s.videoProgress).values({ studentId: sid, blockId: b.id, segments: [[0, (15 * pct) / 100]], durationSec: 15, percent: pct, lastPosition: (15 * pct) / 100 });
      }
    }
    const reachedQuiz = allLessons.findIndex((l) => l.blocks.some((b) => b.id === quizBlockId)) < doneCount;
    if (reachedQuiz) {
      const score = Math.round(55 + rnd() * 45);
      const layout = questionsRows.slice(0, 9).map((q) => ({ q: q.id, o: [] as string[] }));
      await db.insert(s.quizAttempts).values({ studentId: sid, quizId: quiz.id, offeringId: oopP1.id, layout, startedAt: at('2026-10-05T10:00:00+05:00'), finishedAt: at('2026-10-05T10:14:00+05:00'), score });
      await db.insert(s.grades).values({ studentId: sid, gradeItemId: tkQuiz.id, score, rawScore: score, status: 'draft' });
    }
    const reachedLab = allLessons.findIndex((l) => l.blocks.some((b) => b.id === assignmentBlockId)) < doneCount;
    if (reachedLab && !isDemo) {
      const late = idx % 5 === 0;
      const graded = idx % 3 !== 0;
      const raw = Math.round(60 + rnd() * 40);
      const score = late ? Math.round(raw * 0.8 * 10) / 10 : raw;
      await db.insert(s.submissions).values({
        studentId: sid,
        assignmentId: assignment.id,
        offeringId: oopP1.id,
        text: 'Код и описание во вложении. Иерархия: Person → Student, Teacher.',
        submittedAt: at(late ? '2026-10-13T21:00:00+05:00' : '2026-10-10T20:00:00+05:00'),
        isLate: late,
        score: graded ? raw : null,
        feedback: graded ? 'Хорошая структура классов. Добавьте docstring к методам.' : null,
        gradedBy: graded ? ids.teacher : null,
        gradedAt: graded ? at('2026-10-12T15:00:00+05:00') : null,
      });
      if (graded) await db.insert(s.grades).values({ studentId: sid, gradeItemId: tkLab.id, score, rawScore: raw, isLate: late, status: 'draft', updatedBy: ids.teacher });
    }
  }

  // Заявка на позднее изменение оценки (для регистратора)
  const [someone] = group1.slice(2, 3);
  await db.insert(s.gradeChangeRequests).values({
    gradeItemId: tkLab.id,
    studentId: someone,
    oldScore: null,
    newScore: 78,
    reason: 'Студент сдал работу на бумаге во время болезни, есть справка. Прошу внести оценку.',
    requestedBy: ids.teacher,
  });

  // История обмена с Platonus
  const [run] = await db
    .insert(s.syncRuns)
    .values({ direction: 'in', kind: 'students', method: 'file', fileName: 'students_2026-10-01.xlsx', startedBy: ids.registrar, status: 'partial', finishedAt: new Date(), counters: { total: 37, created: 35, updated: 0, skipped: 0, errors: 2 } })
    .returning();
  await db.insert(s.syncIssues).values([
    { runId: run.id, rowNo: 14, problem: 'unknownGroup', payload: { label: 'S250099 Ахметов Руслан', issues: [{ code: 'unknownGroup', params: { value: 'ИС-25-3' } }] } },
    { runId: run.id, rowNo: 29, problem: 'duplicate', payload: { label: 'S250012 Ким Денис', issues: [{ code: 'duplicate', params: { row: 5 } }] } },
  ]);

  // Уведомления демо-студенту
  await db.insert(s.notifications).values([
    { userId: ids.student, type: 'deadlineSoon', params: { item: 'Лабораторная работа 1', date: '20.10' }, link: `/learn/${oopP1.id}` },
    { userId: ids.student, type: 'gradePosted', params: { item: 'Тест по модулям 1–2' }, link: '/learn/grades' },
  ]);

  console.log('Готово. Пароль у всех демо-учёток:', DEMO_PASSWORD);
}

/** Публикация без server-only модулей: снимок + подключение к потокам дисциплины */
async function publishDirect(courseId: string, approverId: string, disciplineId: string) {
  const [c] = await db.select().from(s.courses).where(eq(s.courses.id, courseId));
  const mods = await db.select().from(s.modules).where(eq(s.modules.courseId, courseId)).orderBy(s.modules.position);
  const modulesSnap = [];
  for (const m of mods) {
    const ls = await db.select().from(s.lessons).where(eq(s.lessons.moduleId, m.id)).orderBy(s.lessons.position);
    const lessonsSnap = [];
    for (const l of ls) {
      const bs = await db.select().from(s.lessonBlocks).where(eq(s.lessonBlocks.lessonId, l.id)).orderBy(s.lessonBlocks.position);
      lessonsSnap.push({ id: l.id, title: l.title, required: l.required, estMinutes: l.estMinutes, blocks: bs.map((b) => ({ id: b.id, type: b.type, title: b.title, required: b.required, data: b.data })) });
    }
    modulesSnap.push({ id: m.id, week: m.week, title: m.title, lessons: lessonsSnap });
  }
  const snapshot = { courseId, title: c.title, language: c.language, description: c.description, modules: modulesSnap };
  const [v] = await db.insert(s.courseVersions).values({ courseId, number: 1, snapshot, approvedBy: approverId }).returning();
  await db.update(s.courses).set({ status: 'published', currentVersionId: v.id }).where(eq(s.courses.id, courseId));
  await db
    .update(s.offerings)
    .set({ courseId, courseVersionId: v.id })
    .where(sql`${s.offerings.disciplineId} = ${disciplineId} and ${s.offerings.language} = ${c.language}`);
}

async function createItems(offeringId: string, periodId: string) {
  const wins = await db.select().from(s.calendarWindows).where(eq(s.calendarWindows.periodId, periodId));
  const w = (k: string) => wins.find((x) => x.kind === k)!;
  const start = at('2026-09-01T00:00:00+05:00');
  await db.insert(s.gradeItems).values([
    { offeringId, component: 'TK1', title: 'ТК1', opensAt: start, dueAt: w('rk1').startsAt, hardCloseAt: w('grading_rk1').endsAt, position: 0 },
    { offeringId, component: 'RK1', title: 'РК1', opensAt: w('rk1').startsAt, dueAt: w('rk1').endsAt, hardCloseAt: w('grading_rk1').endsAt, position: 10 },
    { offeringId, component: 'TK2', title: 'ТК2', opensAt: w('rk1').endsAt, dueAt: w('rk2').startsAt, hardCloseAt: w('grading_rk2').endsAt, position: 20 },
    { offeringId, component: 'RK2', title: 'РК2', opensAt: w('rk2').startsAt, dueAt: w('rk2').endsAt, hardCloseAt: w('grading_rk2').endsAt, position: 30 },
    { offeringId, component: 'EXAM', title: 'Экзамен', opensAt: w('session').startsAt, dueAt: w('session').endsAt, hardCloseAt: w('grading_exam').endsAt, position: 40 },
  ]);
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    await client.end();
    process.exit(1);
  });
