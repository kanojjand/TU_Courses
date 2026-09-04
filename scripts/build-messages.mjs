#!/usr/bin/env node
/**
 * Генератор файлов локализации.
 *
 * Источник — единая таблица `strings`, где каждая строка задана сразу на трёх
 * языках. Это гарантирует одинаковый набор ключей во всех файлах и делает
 * невозможной ситуацию «непереведённая строка» (критерий приёмки № 8).
 *
 * Запуск:  node scripts/build-messages.mjs
 * Проверка: node scripts/build-messages.mjs --check   (падает при расхождении)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// [kk, ru, en]
const strings = {
  common: {
    appName: ['Онлайн оқыту платформасы', 'Платформа онлайн-обучения', 'Online Learning Platform'],
    save: ['Сақтау', 'Сохранить', 'Save'],
    cancel: ['Болдырмау', 'Отмена', 'Cancel'],
    delete: ['Жою', 'Удалить', 'Delete'],
    edit: ['Өңдеу', 'Редактировать', 'Edit'],
    create: ['Құру', 'Создать', 'Create'],
    add: ['Қосу', 'Добавить', 'Add'],
    back: ['Артқа', 'Назад', 'Back'],
    next: ['Келесі', 'Далее', 'Next'],
    previous: ['Алдыңғы', 'Предыдущий', 'Previous'],
    search: ['Іздеу', 'Поиск', 'Search'],
    filter: ['Сүзгі', 'Фильтр', 'Filter'],
    reset: ['Тазарту', 'Сбросить', 'Reset'],
    loading: ['Жүктелуде…', 'Загрузка…', 'Loading…'],
    empty: ['Деректер жоқ', 'Нет данных', 'No data'],
    confirm: ['Растау', 'Подтвердить', 'Confirm'],
    close: ['Жабу', 'Закрыть', 'Close'],
    open: ['Ашу', 'Открыть', 'Open'],
    export: ['Экспорттау', 'Экспортировать', 'Export'],
    import: ['Импорттау', 'Импортировать', 'Import'],
    download: ['Жүктеп алу', 'Скачать', 'Download'],
    upload: ['Жүктеу', 'Загрузить', 'Upload'],
    yes: ['Иә', 'Да', 'Yes'],
    no: ['Жоқ', 'Нет', 'No'],
    all: ['Барлығы', 'Все', 'All'],
    of: ['—', 'из', 'of'],
    hours: ['сағат', 'часов', 'hours'],
    credits: ['кредит', 'кредитов', 'credits'],
    minutes: ['минут', 'минут', 'minutes'],
    points: ['балл', 'баллов', 'points'],
    percent: ['%', '%', '%'],
    status: ['Күйі', 'Статус', 'Status'],
    actions: ['Әрекеттер', 'Действия', 'Actions'],
    error: ['Қате', 'Ошибка', 'Error'],
    success: ['Орындалды', 'Выполнено', 'Done'],
    required: ['Міндетті өріс', 'Обязательное поле', 'Required field'],
    notFound: ['Табылмады', 'Не найдено', 'Not found'],
    accessDenied: ['Қол жеткізу шектелген', 'Доступ запрещён', 'Access denied'],
    language: ['Тіл', 'Язык', 'Language'],
    theme: ['Тақырып', 'Тема', 'Theme'],
    logout: ['Шығу', 'Выйти', 'Sign out'],
    login: ['Кіру', 'Войти', 'Sign in'],
    profile: ['Профиль', 'Профиль', 'Profile'],
    notifications: ['Хабарламалар', 'Уведомления', 'Notifications'],
    submit: ['Жіберу', 'Отправить', 'Submit'],
    total: ['Барлығы', 'Итого', 'Total'],
    date: ['Күні', 'Дата', 'Date'],
    name: ['Атауы', 'Наименование', 'Name'],
    code: ['Коды', 'Код', 'Code'],
    description: ['Сипаттамасы', 'Описание', 'Description'],
    deadline: ['Мерзімі', 'Срок', 'Deadline'],
    saved: ['Сақталды', 'Сохранено', 'Saved'],
  },

  nav: {
    home: ['Басты бет', 'Главная', 'Home'],
    catalog: ['Курстар каталогы', 'Каталог курсов', 'Course catalog'],
    about: ['Платформа туралы', 'О платформе', 'About'],
    support: ['Қолдау қызметі', 'Техническая поддержка', 'Support'],
    privacy: ['Дербес деректерді өңдеу', 'Обработка персональных данных', 'Privacy policy'],
    rules: ['Оқу қағидалары', 'Правила обучения', 'Study rules'],
    dashboard: ['Жиынтық', 'Сводка', 'Dashboard'],
    myCourses: ['Менің пәндерім', 'Мои дисциплины', 'My courses'],
    grades: ['Журнал және GPA', 'Журнал и GPA', 'Grades and GPA'],
    transcript: ['Транскрипт', 'Транскрипт', 'Transcript'],
    advisees: ['Қамқорлықтағылар', 'Подопечные', 'Advisees'],
    teach: ['Менің курстарым', 'Мои курсы', 'My courses'],
    admin: ['Әкімшілік', 'Администрирование', 'Administration'],
  },

  home: {
    heroTitle: [
      'Университеттің онлайн оқыту платформасы',
      'Платформа онлайн-обучения университета',
      'University online learning platform',
    ],
    heroSubtitle: [
      'Қашықтан оқыту технологиясын қолдана отырып білім беру бағдарламаларын іске асыру: курстар, бақылау, электрондық журнал және GPA.',
      'Реализация образовательных программ с применением дистанционного обучения: курсы, контроль, электронный журнал и GPA.',
      'Delivery of degree programmes through distance learning: courses, assessment, electronic gradebook and GPA.',
    ],
    ctaCatalog: ['Курстарды қарау', 'Смотреть курсы', 'Browse courses'],
    ctaLogin: ['Жеке кабинетке кіру', 'Войти в кабинет', 'Sign in'],
    statCourses: ['Курстар', 'Курсов', 'Courses'],
    statPrograms: ['Білім беру бағдарламалары', 'Образовательных программ', 'Programmes'],
    statTeachers: ['Оқытушылар', 'Преподавателей', 'Teachers'],
    statStudents: ['Білім алушылар', 'Обучающихся', 'Students'],
    directionsTitle: ['Оқыту бағыттары', 'Направления обучения', 'Fields of study'],
    featuresTitle: ['Платформа мүмкіндіктері', 'Возможности платформы', 'What the platform does'],
    f1Title: ['Кредиттік технология', 'Кредитная технология', 'Credit-based system'],
    f1Text: [
      'Бір академиялық кредит — 30 академиялық сағат. Курс көлемі жарияланғанға дейін тексеріледі.',
      'Один академический кредит — 30 академических часов. Объём курса проверяется до публикации.',
      'One academic credit equals 30 academic hours. Course workload is validated before publication.',
    ],
    f2Title: ['Балдық-рейтингтік жүйе', 'Балльно-рейтинговая система', 'Letter grading system'],
    f2Text: [
      'РК1, РК2, жіберу рейтингі, емтихан, әріптік баға және GPA — Үлгілік қағидаларға сәйкес.',
      'РК1, РК2, рейтинг допуска, экзамен, буквенная оценка и GPA — согласно Типовым правилам.',
      'Midterms, admission rating, exam, letter grade and GPA per national regulations.',
    ],
    f3Title: ['Оқу белсенділігін есепке алу', 'Учёт учебной активности', 'Learning activity tracking'],
    f3Text: [
      'Меңгерілген академиялық сағаттар, аяқталған элементтер, қатысуды есепке алу.',
      'Освоенные академические часы, завершённые элементы, учёт участия.',
      'Academic hours earned, items completed, participation records.',
    ],
  },

  catalog: {
    title: ['Курстар каталогы', 'Каталог курсов', 'Course catalog'],
    filterProgram: ['Білім беру бағдарламасы', 'Образовательная программа', 'Programme'],
    filterDepartment: ['Кафедра', 'Кафедра', 'Department'],
    filterLanguage: ['Оқыту тілі', 'Язык обучения', 'Language of instruction'],
    filterLevel: ['Деңгейі', 'Уровень', 'Level'],
    filterCredits: ['Кредит көлемі', 'Объём в кредитах', 'Credits'],
    filterForm: ['Оқыту нысаны', 'Форма обучения', 'Study form'],
    searchPlaceholder: [
      'Атауы немесе аннотациясы бойынша іздеу',
      'Поиск по наименованию и аннотации',
      'Search by title or summary',
    ],
    found: ['Табылды: {count}', 'Найдено: {count}', 'Found: {count}'],
    nothingFound: [
      'Сұранысыңызға сәйкес курс табылмады',
      'По вашему запросу курсы не найдены',
      'No courses match your query',
    ],
    teacher: ['Оқытушы', 'Преподаватель', 'Instructor'],
    outcomes: ['Оқу нәтижелері', 'Ожидаемые результаты обучения', 'Learning outcomes'],
    thematicPlan: ['Тақырыптық жоспар', 'Тематический план', 'Course outline'],
    contentHidden: [
      'Оқу мазмұны тек тіркелген білім алушыларға қолжетімді',
      'Учебное содержимое доступно только зачисленным обучающимся',
      'Course content is available to enrolled students only',
    ],
  },

  auth: {
    signInTitle: ['Жүйеге кіру', 'Вход в систему', 'Sign in'],
    email: ['E-mail', 'E-mail', 'Email'],
    password: ['Құпия сөз', 'Пароль', 'Password'],
    signIn: ['Кіру', 'Войти', 'Sign in'],
    invalidCredentials: [
      'E-mail немесе құпия сөз қате',
      'Неверный e-mail или пароль',
      'Invalid email or password',
    ],
    accountLocked: [
      'Есептік жазба уақытша бұғатталған. 15 минуттан кейін қайталаңыз.',
      'Учётная запись временно заблокирована. Повторите через 15 минут.',
      'Account temporarily locked. Try again in 15 minutes.',
    ],
    noSelfRegistration: [
      'Есептік жазбаны әкімші құрады. Тіркелу үшін оқу бөліміне хабарласыңыз.',
      'Учётные записи создаёт администратор. Для регистрации обратитесь в учебный отдел.',
      'Accounts are created by the administrator. Contact the registrar to get access.',
    ],
    changePasswordTitle: ['Құпия сөзді ауыстыру', 'Смена пароля', 'Change password'],
    changePasswordHint: [
      'Алғашқы кіру кезінде уақытша құпия сөзді ауыстыру қажет.',
      'При первом входе необходимо заменить временный пароль.',
      'You must replace the temporary password on first sign-in.',
    ],
    newPassword: ['Жаңа құпия сөз', 'Новый пароль', 'New password'],
    repeatPassword: ['Құпия сөзді қайталаңыз', 'Повторите пароль', 'Repeat password'],
    passwordsDoNotMatch: ['Құпия сөздер сәйкес келмейді', 'Пароли не совпадают', 'Passwords do not match'],
    passwordTooShort: [
      'Кемінде 10 таңба қажет',
      'Требуется не менее 10 символов',
      'At least 10 characters required',
    ],
  },

  consent: {
    title: [
      'Дербес деректерді өңдеуге келісім',
      'Согласие на обработку персональных данных',
      'Personal data processing consent',
    ],
    intro: [
      'Платформаны пайдалануды бастау үшін дербес деректерді өңдеуге келісім беруіңіз қажет.',
      'Для начала работы с Платформой необходимо дать согласие на обработку персональных данных.',
      'To start using the platform you must consent to the processing of your personal data.',
    ],
    accept: ['Келісемін', 'Принимаю', 'I accept'],
    version: ['Құжат нұсқасы', 'Версия документа', 'Document version'],
    readFull: ['Толық мәтінді оқу', 'Читать полный текст', 'Read the full text'],
  },

  student: {
    currentCourses: ['Ағымдағы кезең пәндері', 'Дисциплины текущего периода', 'Current period courses'],
    upcomingDeadlines: ['Жақын мерзімдер', 'Ближайшие дедлайны', 'Upcoming deadlines'],
    overallProgress: ['Жалпы үлгерім', 'Общий прогресс', 'Overall progress'],
    currentGpa: ['Ағымдағы GPA', 'Текущий GPA', 'Current GPA'],
    noDeadlines: ['Жақын мерзімдер жоқ', 'Ближайших дедлайнов нет', 'No upcoming deadlines'],
    progressHours: [
      'Меңгерілді: {earned} / {total} академиялық сағат',
      'Освоено {earned} из {total} академических часов',
      '{earned} of {total} academic hours completed',
    ],
    progressItems: [
      'Аяқталды: {done} / {total} элемент',
      'Завершено {done} из {total} элементов',
      '{done} of {total} items completed',
    ],
    creditsOnCompletion: [
      'Сәтті аяқтағанда — {credits} кредит',
      '{credits} кредита при успешном завершении',
      '{credits} credits upon successful completion',
    ],
    startQuiz: ['Тестті бастау', 'Начать тест', 'Start quiz'],
    continueQuiz: ['Тестті жалғастыру', 'Продолжить тест', 'Resume quiz'],
    attemptsLeft: ['Қалған әрекет: {n}', 'Осталось попыток: {n}', 'Attempts left: {n}'],
    timeLeft: ['Қалған уақыт', 'Осталось времени', 'Time left'],
    submitQuiz: ['Тестті тапсыру', 'Завершить тест', 'Submit quiz'],
    quizResult: ['Тест нәтижесі', 'Результат теста', 'Quiz result'],
    submitWork: ['Жұмысты тапсыру', 'Сдать работу', 'Submit work'],
    workSubmitted: ['Жұмыс тапсырылды', 'Работа сдана', 'Work submitted'],
    teacherComment: ['Оқытушының пікірі', 'Комментарий преподавателя', 'Instructor feedback'],
    markComplete: ['Аяқталды деп белгілеу', 'Отметить как завершённое', 'Mark as complete'],
    completed: ['Аяқталды', 'Завершено', 'Completed'],
    downloadDisabled: [
      'Материалды құрылғыға сақтауға болмайды',
      'Сохранение материала на устройство запрещено',
      'Saving this material to your device is disabled',
    ],
  },

  teacher: {
    myCourses: ['Менің курстарым', 'Мои курсы', 'My courses'],
    builder: ['Мазмұн конструкторы', 'Конструктор содержания', 'Content builder'],
    syllabus: ['Силлабус', 'Силлабус', 'Syllabus'],
    questionBank: ['Сұрақтар банкі', 'Банк вопросов', 'Question bank'],
    gradebook: ['Журнал', 'Журнал', 'Gradebook'],
    submissions: ['Жұмыстарды тексеру', 'Проверка работ', 'Submissions'],
    analytics: ['Аналитика', 'Аналитика', 'Analytics'],
    addModule: ['Бөлім қосу', 'Добавить модуль', 'Add module'],
    addItem: ['Элемент қосу', 'Добавить элемент', 'Add item'],
    copyFromPrevious: [
      'Өткен кезең курсынан көшіру',
      'Копировать из курса прошлого периода',
      'Copy from a previous period',
    ],
    plannedHours: ['Жоспарлы еңбек сыйымдылығы', 'Плановая трудоёмкость', 'Planned workload'],
    workType: ['Оқу жұмысының түрі', 'Вид учебной работы', 'Type of academic work'],
    hoursIndicator: [
      'Бөлінді: {planned} / {required} академиялық сағат ({credits} кредит)',
      'Распределено {planned} из {required} академических часов ({credits} кр.)',
      '{planned} of {required} academic hours allocated ({credits} credits)',
    ],
    publishBlocked: [
      'Сағаттар көлемі сәйкес келмегендіктен жариялау мүмкін емес',
      'Публикация невозможна: объём часов не соответствует кредитам',
      'Cannot publish: allocated hours do not match the credit value',
    ],
    sendToReview: ['Әдіскерге жіберу', 'Отправить методисту', 'Send for review'],
    publish: ['Жариялау', 'Опубликовать', 'Publish'],
    published: ['Жарияланды', 'Опубликован', 'Published'],
    onReview: ['Келісуде', 'На согласовании', 'Under review'],
    rejected: ['Пысықтауға қайтарылды', 'Возвращён на доработку', 'Returned for revision'],
    draft: ['Жоба', 'Черновик', 'Draft'],
    ungraded: ['Тексерілмеген', 'Непроверенные', 'Ungraded'],
    grade: ['Баға қою', 'Выставить балл', 'Grade'],
    returnForRevision: ['Пысықтауға қайтару', 'Вернуть на доработку', 'Return for revision'],
    announcement: ['Хабарландыру', 'Объявление', 'Announcement'],
    importQuestions: ['Сұрақтарды XLSX-тен импорттау', 'Импорт вопросов из XLSX', 'Import questions from XLSX'],
    noActivityStudents: ['Белсенділігі жоқ білім алушылар', 'Студенты без активности', 'Students with no activity'],
    completionRate: ['Аяқтағандар үлесі', 'Доля завершивших', 'Completion rate'],
    avgTime: ['Меңгеруге кеткен орташа уақыт', 'Среднее время освоения', 'Average time to complete'],
    scoreDistribution: ['Балдардың таралуы', 'Распределение баллов', 'Score distribution'],
  },

  grades: {
    rk1: ['РБ1', 'РК1', 'Midterm 1'],
    rk2: ['РБ2', 'РК2', 'Midterm 2'],
    admission: ['Жіберу рейтингі', 'Рейтинг допуска', 'Admission rating'],
    exam: ['Емтихан', 'Экзамен', 'Final exam'],
    final: ['Қорытынды балл', 'Итоговый балл', 'Final score'],
    letter: ['Әріптік баға', 'Буквенная оценка', 'Letter grade'],
    gpaPoints: ['Сандық баламасы', 'Цифровой эквивалент', 'Grade points'],
    traditional: ['Дәстүрлі жүйе', 'Традиционная система', 'Traditional scale'],
    gpa: ['GPA', 'GPA', 'GPA'],
    admitted: ['Жіберілді', 'Допущен', 'Admitted'],
    notAdmitted: ['Жіберілмеді', 'Не допущен', 'Not admitted'],
    gradeSheet: ['Ведомость', 'Ведомость', 'Grade sheet'],
    closeSheet: ['Ведомостьті жабу', 'Закрыть ведомость', 'Close grade sheet'],
    sheetClosed: ['Ведомость жабылған', 'Ведомость закрыта', 'Grade sheet closed'],
    reopenReason: [
      'Түзету негіздемесі',
      'Основание для корректировки',
      'Reason for the correction',
    ],
    afterCloseLocked: [
      'Ведомость жабылғаннан кейін бағаны өзгерту мүмкін емес',
      'Изменение оценки после закрытия ведомости невозможно',
      'Grades cannot be changed after the sheet is closed',
    ],
  },

  admin: {
    users: ['Пайдаланушылар', 'Пользователи', 'Users'],
    programs: ['Білім беру бағдарламалары', 'Образовательные программы', 'Programmes'],
    disciplines: ['Пәндер', 'Дисциплины', 'Disciplines'],
    periods: ['Академиялық кезеңдер', 'Академические периоды', 'Academic periods'],
    enrollments: ['Тіркеу', 'Регистрация на курсы', 'Enrollments'],
    courses: ['Курстарды келісу', 'Согласование курсов', 'Course review'],
    gradesheets: ['Ведомостьтер', 'Ведомости', 'Grade sheets'],
    reports: ['Есептер', 'Отчёты', 'Reports'],
    integrations: ['Интеграция', 'Интеграции', 'Integrations'],
    audit: ['Аудит журналы', 'Журнал аудита', 'Audit log'],
    settings: ['Баптаулар', 'Настройки', 'Settings'],
    importUsers: ['Пайдаланушыларды импорттау', 'Импорт пользователей', 'Import users'],
    resetPassword: ['Құпия сөзді қалпына келтіру', 'Сбросить пароль', 'Reset password'],
    blockUser: ['Бұғаттау', 'Заблокировать', 'Block'],
    academicHour: [
      'Академиялық сағаттың ұзақтығы, минут',
      'Продолжительность академического часа, минут',
      'Academic hour duration, minutes',
    ],
    gradeFormula: ['Қорытынды баға формуласы', 'Формула итоговой оценки', 'Final grade formula'],
    outboxQueue: ['Шығыс оқиғалар кезегі', 'Очередь исходящих событий', 'Outgoing event queue'],
    approveFinalGrades: [
      'Қорытынды бағаларды беруді растау',
      'Подтвердить передачу итоговых оценок',
      'Approve transfer of final grades',
    ],
  },

  errors: {
    notFoundTitle: ['Бет табылмады', 'Страница не найдена', 'Page not found'],
    notFoundText: [
      'Сұралған бет жоқ немесе жойылған.',
      'Запрошенная страница не существует или была удалена.',
      'The requested page does not exist or has been removed.',
    ],
    forbiddenTitle: ['Қол жеткізу шектелген', 'Доступ запрещён', 'Access denied'],
    forbiddenText: [
      'Бұл бөлімге кіру құқығыңыз жоқ.',
      'У вас нет прав для доступа к этому разделу.',
      'You do not have permission to access this section.',
    ],
    serverTitle: ['Қате орын алды', 'Произошла ошибка', 'Something went wrong'],
    serverText: [
      'Әрекетті қайталап көріңіз. Қате қайталанса, қолдау қызметіне хабарласыңыз.',
      'Повторите попытку. Если ошибка повторяется, обратитесь в техническую поддержку.',
      'Please try again. If the error persists, contact support.',
    ],
    backHome: ['Басты бетке', 'На главную', 'Back to home'],
  },
};

const LOCALES = ['kk', 'ru', 'en'];

function extract(node, index) {
  if (Array.isArray(node)) {
    if (node.length !== 3) throw new Error(`Ожидается 3 варианта, получено ${node.length}`);
    return node[index];
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) out[key] = extract(value, index);
  return out;
}

const check = process.argv.includes('--check');
let failed = false;

LOCALES.forEach((locale, index) => {
  const data = extract(strings, index);
  const json = JSON.stringify(data, null, 2) + '\n';
  const path = join(root, 'messages', `${locale}.json`);
  if (check) {
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (existing !== json) {
      console.error(`✗ messages/${locale}.json расходится с источником`);
      failed = true;
    } else {
      console.log(`✓ messages/${locale}.json актуален`);
    }
  } else {
    writeFileSync(path, json, 'utf8');
    console.log(`✓ messages/${locale}.json (${countKeys(data)} ключей)`);
  }
});

function countKeys(obj) {
  return Object.values(obj).reduce(
    (n, v) => n + (typeof v === 'object' ? countKeys(v) : 1),
    0
  );
}

if (failed) process.exit(1);
