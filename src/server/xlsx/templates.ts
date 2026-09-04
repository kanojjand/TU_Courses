import 'server-only';
import ExcelJS from 'exceljs';

/**
 * Шаблоны импорта — Приложения В и Г к ТЗ.
 * Служат одновременно образцом формата и инструкцией: первый лист содержит
 * данные, второй — описание колонок и допустимых значений.
 */

const BRAND = 'FF155E75';

export function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 32;
}

export function autoWidth(sheet: ExcelJS.Worksheet, min = 10, max = 45): void {
  sheet.columns.forEach((column) => {
    let width = min;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value);
      width = Math.max(width, Math.min(max, value.length + 2));
    });
    column.width = width;
  });
}

function addGuide(wb: ExcelJS.Workbook, rows: [string, string, string][]): void {
  const sheet = wb.addWorksheet('Инструкция');
  sheet.columns = [
    { header: 'Колонка', key: 'col', width: 24 },
    { header: 'Обязательна', key: 'req', width: 14 },
    { header: 'Описание и допустимые значения', key: 'desc', width: 80 },
  ];
  styleHeader(sheet.getRow(1));
  rows.forEach(([col, req, desc]) => sheet.addRow({ col, req, desc }));
  sheet.getColumn('desc').alignment = { wrapText: true, vertical: 'top' };
}

/** Приложение В. Шаблон импорта пользователей (F-A-03). */
export async function buildUsersTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Платформа онлайн-обучения';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Пользователи');
  sheet.columns = [
    { header: 'ИИН', key: 'iin', width: 16 },
    { header: 'Фамилия (kk)', key: 'lastNameKk', width: 20 },
    { header: 'Имя (kk)', key: 'firstNameKk', width: 20 },
    { header: 'Отчество (kk)', key: 'middleNameKk', width: 20 },
    { header: 'Фамилия (ru)', key: 'lastNameRu', width: 20 },
    { header: 'Имя (ru)', key: 'firstNameRu', width: 20 },
    { header: 'Отчество (ru)', key: 'middleNameRu', width: 20 },
    { header: 'Фамилия (en)', key: 'lastNameEn', width: 20 },
    { header: 'Имя (en)', key: 'firstNameEn', width: 20 },
    { header: 'E-mail', key: 'email', width: 28 },
    { header: 'Телефон', key: 'phone', width: 16 },
    { header: 'Роль', key: 'role', width: 14 },
    { header: 'Код ОП', key: 'programCode', width: 14 },
    { header: 'Группа', key: 'groupName', width: 14 },
    { header: 'Курс', key: 'studyYear', width: 8 },
    { header: 'Форма обучения', key: 'studyForm', width: 16 },
    { header: 'Язык обучения', key: 'language', width: 14 },
    { header: 'Год поступления', key: 'admissionYear', width: 16 },
    { header: 'Код кафедры', key: 'departmentCode', width: 14 },
    { header: 'Должность', key: 'position', width: 22 },
    { header: 'ID Platonus', key: 'platonusId', width: 16 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.addRow({
    iin: '990101300123',
    lastNameKk: 'Сейтқали',
    firstNameKk: 'Айгүл',
    lastNameRu: 'Сейткали',
    firstNameRu: 'Айгуль',
    middleNameRu: 'Ерлановна',
    lastNameEn: 'Seitkali',
    firstNameEn: 'Aigul',
    email: 'a.seitkali@example.kz',
    phone: '+77010000001',
    role: 'STUDENT',
    programCode: '6B06103',
    groupName: 'ВТ-24-1',
    studyYear: 1,
    studyForm: 'DISTANCE',
    language: 'RU',
    admissionYear: 2024,
  });

  addGuide(wb, [
    ['ИИН', 'да', '12 цифр. Проверяется контрольный разряд. Хранится в зашифрованном виде.'],
    ['Фамилия/Имя (kk, ru)', 'да', 'ФИО на казахском и русском языках. Английский вариант — при отсутствии заполняется транслитерацией.'],
    ['Отчество', 'нет', 'При наличии.'],
    ['E-mail', 'да', 'Уникален в системе. Используется как логин.'],
    ['Телефон', 'нет', 'Формат +7XXXXXXXXXX.'],
    ['Роль', 'да', 'STUDENT | TEACHER | TUTOR | ADVISOR | METHODIST | REGISTRAR | ADMIN'],
    ['Код ОП', 'для STUDENT', 'Код образовательной программы по классификатору, напр. 6B06103.'],
    ['Группа', 'для STUDENT', 'Наименование академической группы. Создаётся автоматически, если отсутствует.'],
    ['Курс', 'для STUDENT', 'Целое число от 1 до 6.'],
    ['Форма обучения', 'для STUDENT', 'FULL_TIME | PART_TIME | DISTANCE | EVENING'],
    ['Язык обучения', 'для STUDENT', 'KK | RU | EN'],
    ['Год поступления', 'для STUDENT', 'Четыре цифры, напр. 2024.'],
    ['Код кафедры', 'для TEACHER', 'Код кафедры из справочника.'],
    ['Должность', 'для TEACHER', 'Свободный текст, напр. «старший преподаватель».'],
    ['ID Platonus', 'нет', 'Внешний идентификатор для сопоставления при интеграции.'],
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Приложение Г. Шаблон импорта вопросов (F-T-08). */
export async function buildQuestionsTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Платформа онлайн-обучения';

  const sheet = wb.addWorksheet('Вопросы');
  sheet.columns = [
    { header: 'Тип', key: 'type', width: 16 },
    { header: 'Тема', key: 'topic', width: 20 },
    { header: 'Сложность', key: 'difficulty', width: 12 },
    { header: 'Балл', key: 'points', width: 8 },
    { header: 'Текст вопроса', key: 'text', width: 55 },
    { header: 'Вариант 1', key: 'o1', width: 22 },
    { header: 'Вариант 2', key: 'o2', width: 22 },
    { header: 'Вариант 3', key: 'o3', width: 22 },
    { header: 'Вариант 4', key: 'o4', width: 22 },
    { header: 'Вариант 5', key: 'o5', width: 22 },
    { header: 'Верные', key: 'correct', width: 12 },
    { header: 'Пояснение', key: 'explanation', width: 40 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.addRow({
    type: 'SINGLE_CHOICE',
    topic: 'Основы',
    difficulty: 'MEDIUM',
    points: 1,
    text: 'Сколько академических часов составляет один академический кредит?',
    o1: '15',
    o2: '30',
    o3: '45',
    o4: '60',
    correct: '2',
    explanation: 'ГОСО, п. 29: один академический кредит равен 30 академическим часам.',
  });
  sheet.addRow({
    type: 'MULTI_CHOICE',
    topic: 'Оценивание',
    difficulty: 'HARD',
    points: 2,
    text: 'Какие буквенные оценки являются неудовлетворительными?',
    o1: 'D',
    o2: 'FX',
    o3: 'F',
    o4: 'C−',
    correct: '2,3',
  });
  sheet.addRow({
    type: 'TRUE_FALSE',
    topic: 'Оценивание',
    difficulty: 'EASY',
    points: 1,
    text: 'FX даёт право на повторную сдачу экзамена без повторного изучения дисциплины.',
    o1: 'Верно',
    o2: 'Неверно',
    correct: '1',
  });
  sheet.addRow({
    type: 'SHORT_ANSWER',
    topic: 'Основы',
    difficulty: 'MEDIUM',
    points: 1,
    text: 'Укажите минимальный рейтинг допуска к экзамену (в баллах).',
    o1: '50',
    correct: '1',
    explanation: 'Допустимые ответы перечисляются в колонках «Вариант».',
  });
  sheet.addRow({
    type: 'MATCHING',
    topic: 'Шкала',
    difficulty: 'MEDIUM',
    points: 2,
    text: 'Установите соответствие буквенной оценки и цифрового эквивалента.',
    o1: 'A=4,00',
    o2: 'B=3,00',
    o3: 'C=2,00',
    o4: 'D=1,00',
    correct: '',
  });
  sheet.addRow({
    type: 'ORDERING',
    topic: 'Процесс',
    difficulty: 'MEDIUM',
    points: 2,
    text: 'Расположите этапы контроля в правильном порядке.',
    o1: 'Текущий контроль',
    o2: 'РК1',
    o3: 'РК2',
    o4: 'Экзамен',
    correct: '',
  });

  addGuide(wb, [
    ['Тип', 'да', 'SINGLE_CHOICE | MULTI_CHOICE | TRUE_FALSE | SHORT_ANSWER | MATCHING | ORDERING'],
    ['Тема', 'нет', 'Произвольное название темы. Используется для случайной выборки вопросов в тест.'],
    ['Сложность', 'нет', 'EASY | MEDIUM | HARD. По умолчанию MEDIUM.'],
    ['Балл', 'нет', 'Балл за вопрос. По умолчанию 1.'],
    ['Текст вопроса', 'да', 'Формулировка вопроса.'],
    ['Вариант 1…5', 'зависит от типа', 'SINGLE/MULTI/TRUE_FALSE — варианты ответа. SHORT_ANSWER — допустимые ответы. MATCHING — пары в формате «левое=правое». ORDERING — элементы в ПРАВИЛЬНОМ порядке.'],
    ['Верные', 'для SINGLE/MULTI/TRUE_FALSE', 'Номера верных вариантов через запятую, напр. «2» или «2,3». Для MATCHING и ORDERING не заполняется.'],
    ['Пояснение', 'нет', 'Показывается после проверки, если включён показ верных ответов.'],
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Шаблон импорта контингента — резервный файловый обмен (раздел 9.3). */
export async function buildEnrollmentsTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Регистрация');
  sheet.columns = [
    { header: 'ИИН студента', key: 'iin', width: 16 },
    { header: 'E-mail студента', key: 'email', width: 28 },
    { header: 'Код дисциплины', key: 'disciplineCode', width: 18 },
    { header: 'Академический период', key: 'periodName', width: 22 },
    { header: 'Учебный год', key: 'academicYear', width: 14 },
    { header: 'Поток', key: 'streamName', width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.addRow({
    iin: '990101300123',
    email: 'a.seitkali@example.kz',
    disciplineCode: 'INF1201',
    periodName: '1 семестр',
    academicYear: '2026-2027',
    streamName: '',
  });

  addGuide(wb, [
    ['ИИН студента', 'да, либо e-mail', 'Идентификация студента по ИИН или e-mail — достаточно одного из полей.'],
    ['Код дисциплины', 'да', 'Код из справочника дисциплин.'],
    ['Академический период', 'да', 'Наименование периода, напр. «1 семестр».'],
    ['Учебный год', 'да', 'Формат «2026-2027».'],
    ['Поток', 'нет', 'Указывается, если дисциплина в периоде читается несколькими потоками.'],
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
