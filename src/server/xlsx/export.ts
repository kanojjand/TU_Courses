import 'server-only';
import ExcelJS from 'exceljs';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { loadGradebook } from '@/server/grades';
import { autoWidth, styleHeader } from './templates';

/**
 * Экспорт ведомостей и отчётов — F-A-06, F-T-12.
 * Критерий приёмки № 7: ведомость выгружается в XLSX в форме, принятой в вузе.
 *
 * Форма ведомости подлежит согласованию с офисом регистратора (п. 14.1.6 ТЗ);
 * реализована типовая форма, структура вынесена в одну функцию для правки.
 */

const CONTROL_LABELS = {
  RK1: 'Рубежный контроль 1',
  RK2: 'Рубежный контроль 2',
  EXAM: 'Экзаменационная ведомость',
} as const;

/** Ведомость по курсу (критерий приёмки № 7) */
export async function exportGradeSheet(
  courseId: string,
  controlPeriod: 'RK1' | 'RK2' | 'EXAM'
): Promise<{ buffer: Buffer; fileName: string }> {
  const [book, course] = await Promise.all([
    loadGradebook(courseId),
    prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        discipline: { include: { department: { include: { faculty: true } } } },
        period: { include: { academicYear: true } },
        teachers: {
          include: {
            teacher: {
              include: { user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } } },
            },
          },
        },
        gradeSheets: { where: { controlPeriod } },
      },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Платформа онлайн-обучения';
  wb.created = new Date();

  const sheet = wb.addWorksheet(CONTROL_LABELS[controlPeriod], {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const sheetRecord = course.gradeSheets[0];
  const lead = course.teachers.find((t) => t.isLead)?.teacher.user;

  // ── Шапка ведомости ───────────────────────────────────────────────────────
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = CONTROL_LABELS[controlPeriod];
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  const header: [string, string][] = [
    ['Факультет / школа:', course.discipline.department.faculty.nameRu],
    ['Кафедра:', course.discipline.department.nameRu],
    ['Дисциплина:', `${course.discipline.code} — ${course.discipline.nameRu}`],
    ['Объём:', `${course.discipline.credits} кредита (${course.discipline.credits * 30} академических часов)`],
    ['Академический период:', `${course.period.academicYear.name}, ${course.period.name}`],
    ['Преподаватель:', lead ? `${lead.lastNameRu} ${lead.firstNameRu} ${lead.middleNameRu ?? ''}`.trim() : '—'],
    ['Номер ведомости:', sheetRecord?.number ?? '—'],
    ['Статус:', sheetRecord?.status === 'CLOSED' ? 'Закрыта' : 'Черновик'],
    ['Дата формирования:', new Date().toLocaleDateString('ru-RU')],
  ];

  header.forEach(([label, value], i) => {
    const row = sheet.getRow(3 + i);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    sheet.mergeCells(3 + i, 2, 3 + i, 5);
    row.getCell(2).value = value;
  });

  const tableStart = 3 + header.length + 2;

  // ── Заголовок таблицы ─────────────────────────────────────────────────────
  const items = book.items.filter((i) => i.controlPeriod === controlPeriod);
  const columns: string[] = ['№', 'ФИО обучающегося', 'Группа'];
  items.forEach((i) => columns.push(`${i.title} (макс. ${i.maxScore})`));

  if (controlPeriod === 'EXAM') {
    columns.push('РК1', 'РК2', 'Рейтинг допуска', 'Допуск', 'Экзамен', 'Итоговый балл', 'Оценка', 'Цифр. экв.', 'Традиционная');
  } else {
    columns.push(`Итог ${controlPeriod}`);
  }

  const headerRow = sheet.getRow(tableStart);
  columns.forEach((c, i) => (headerRow.getCell(i + 1).value = c));
  styleHeader(headerRow);

  // ── Строки ────────────────────────────────────────────────────────────────
  book.rows.forEach((r, index) => {
    const row = sheet.getRow(tableStart + 1 + index);
    let col = 1;
    row.getCell(col++).value = index + 1;
    row.getCell(col++).value = r.fullName;
    row.getCell(col++).value = r.group;

    items.forEach((item) => {
      row.getCell(col++).value = r.scores[item.id] ?? null;
    });

    if (controlPeriod === 'EXAM') {
      row.getCell(col++).value = r.rk1;
      row.getCell(col++).value = r.rk2;
      row.getCell(col++).value = r.admissionScore;
      row.getCell(col++).value = r.isAdmitted ? 'допущен' : 'не допущен';
      row.getCell(col++).value = r.examScore;
      row.getCell(col++).value = r.finalScore;
      row.getCell(col++).value = r.letter;
      row.getCell(col++).value = r.gpaPoints;
      row.getCell(col++).value = r.traditional;
    } else {
      row.getCell(col++).value = controlPeriod === 'RK1' ? r.rk1 : r.rk2;
    }

    row.eachCell((c) => {
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // ── Подписи ───────────────────────────────────────────────────────────────
  const signRow = tableStart + book.rows.length + 3;
  sheet.getCell(signRow, 1).value = 'Преподаватель:';
  sheet.getCell(signRow, 3).value = '_______________________';
  sheet.getCell(signRow + 2, 1).value = 'Офис регистратора:';
  sheet.getCell(signRow + 2, 3).value = '_______________________';

  sheet.views = [{ state: 'frozen', ySplit: tableStart }];
  autoWidth(sheet, 8, 32);

  const fileName = `Ведомость_${course.discipline.code}_${controlPeriod}_${course.period.academicYear.name}.xlsx`;
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), fileName };
}

/** F-A-06. Отчёт об успеваемости по группам / программам / кафедрам. */
export async function exportPerformanceReport(filters: {
  periodId?: string;
  programId?: string;
  departmentId?: string;
  groupId?: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const grades = await prisma.periodGrade.findMany({
    where: {
      ...(filters.periodId ? { periodId: filters.periodId } : {}),
      course: {
        discipline: {
          ...(filters.programId ? { programId: filters.programId } : {}),
          ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        },
      },
      ...(filters.groupId ? { student: { groupId: filters.groupId } } : {}),
    },
    include: {
      course: { include: { discipline: true } },
      period: { include: { academicYear: true } },
      student: {
        include: {
          user: { select: { lastNameRu: true, firstNameRu: true, middleNameRu: true } },
          group: { select: { name: true } },
          program: { select: { code: true, nameRu: true } },
        },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Успеваемость');
  sheet.columns = [
    { header: 'Группа', key: 'group', width: 14 },
    { header: 'ФИО', key: 'name', width: 34 },
    { header: 'Код ОП', key: 'program', width: 12 },
    { header: 'Дисциплина', key: 'discipline', width: 36 },
    { header: 'Кредиты', key: 'credits', width: 10 },
    { header: 'Период', key: 'period', width: 22 },
    { header: 'РК1', key: 'rk1', width: 8 },
    { header: 'РК2', key: 'rk2', width: 8 },
    { header: 'Допуск', key: 'admission', width: 10 },
    { header: 'Экзамен', key: 'exam', width: 10 },
    { header: 'Итог', key: 'final', width: 10 },
    { header: 'Оценка', key: 'letter', width: 10 },
    { header: 'Цифр. экв.', key: 'gpa', width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const g of grades) {
    sheet.addRow({
      group: g.student.group?.name ?? '',
      name: [g.student.user.lastNameRu, g.student.user.firstNameRu, g.student.user.middleNameRu]
        .filter(Boolean)
        .join(' '),
      program: g.student.program.code,
      discipline: `${g.course.discipline.code} — ${g.course.discipline.nameRu}`,
      credits: g.course.discipline.credits,
      period: `${g.period.academicYear.name} ${g.period.name}`,
      rk1: decOrNull(g.rk1),
      rk2: decOrNull(g.rk2),
      admission: decOrNull(g.admissionScore),
      exam: decOrNull(g.examScore),
      final: decOrNull(g.finalScore),
      letter: g.letter,
      gpa: decOrNull(g.gpaPoints),
    });
  }

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `Успеваемость_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

/**
 * F-A-06. Сводка по посещаемости и участию.
 * Данные передаются в ИС МО через Platonus (п. 40 Типовых правил).
 */
export async function exportAttendanceReport(periodId: string): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const progress = await prisma.progress.findMany({
    where: { course: { periodId } },
    include: {
      course: { include: { discipline: true } },
      student: {
        include: {
          user: { select: { lastNameRu: true, firstNameRu: true } },
          group: { select: { name: true } },
        },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Участие');
  sheet.columns = [
    { header: 'Группа', key: 'group', width: 14 },
    { header: 'ФИО', key: 'name', width: 34 },
    { header: 'Дисциплина', key: 'discipline', width: 36 },
    { header: 'Завершено элементов', key: 'completed', width: 20 },
    { header: 'Всего элементов', key: 'total', width: 18 },
    { header: 'Освоено ак. часов', key: 'earned', width: 20 },
    { header: 'Плановых ак. часов', key: 'planned', width: 20 },
    { header: 'Прогресс, %', key: 'percent', width: 14 },
    { header: 'Время в системе, мин', key: 'minutes', width: 22 },
    { header: 'Последняя активность', key: 'last', width: 22 },
    { header: 'Участие', key: 'attended', width: 12 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const p of progress) {
    sheet.addRow({
      group: p.student.group?.name ?? '',
      name: `${p.student.user.lastNameRu} ${p.student.user.firstNameRu}`,
      discipline: `${p.course.discipline.code} — ${p.course.discipline.nameRu}`,
      completed: p.completedItems,
      total: p.totalItems,
      earned: dec(p.earnedHours),
      planned: dec(p.totalHours),
      percent: dec(p.percent),
      minutes: Math.round(dec(p.totalMinutes)),
      last: p.lastActivityAt ? p.lastActivityAt.toLocaleString('ru-RU') : '—',
      attended: dec(p.totalMinutes) >= 15 || p.completedItems > 0 ? 'да' : 'нет',
    });
  }

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `Участие_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

/** F-A-06. Курсы, не прошедшие проверку по объёму часов. */
export async function exportInvalidCoursesReport(): Promise<{ buffer: Buffer; fileName: string }> {
  const courses = await prisma.course.findMany({
    where: { status: { in: ['DRAFT', 'ON_REVIEW', 'REJECTED', 'APPROVED'] } },
    include: {
      discipline: { include: { department: true } },
      period: { include: { academicYear: true } },
      modules: { include: { items: { select: { plannedAcademicHours: true } } } },
      teachers: {
        include: { teacher: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } } },
      },
    },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Несоответствие часов');
  sheet.columns = [
    { header: 'Кафедра', key: 'department', width: 30 },
    { header: 'Дисциплина', key: 'discipline', width: 38 },
    { header: 'Период', key: 'period', width: 22 },
    { header: 'Преподаватель', key: 'teacher', width: 30 },
    { header: 'Статус', key: 'status', width: 14 },
    { header: 'Кредиты', key: 'credits', width: 10 },
    { header: 'Требуется часов', key: 'required', width: 18 },
    { header: 'Распределено', key: 'planned', width: 16 },
    { header: 'Расхождение', key: 'delta', width: 14 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const c of courses) {
    const planned = c.modules
      .flatMap((m) => m.items)
      .reduce((s, i) => s + dec(i.plannedAcademicHours), 0);
    const required = c.discipline.credits * 30;
    const delta = Math.round((planned - required) * 100) / 100;
    if (delta === 0) continue;

    sheet.addRow({
      department: c.discipline.department.nameRu,
      discipline: `${c.discipline.code} — ${c.discipline.nameRu}`,
      period: `${c.period.academicYear.name} ${c.period.name}`,
      teacher: c.teachers
        .map((t) => `${t.teacher.user.lastNameRu} ${t.teacher.user.firstNameRu}`)
        .join(', '),
      status: c.status,
      credits: c.discipline.credits,
      required,
      planned: Math.round(planned * 100) / 100,
      delta,
    });
  }

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `Курсы_несоответствие_часов_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

/** Раздел 9.3. Выгрузка итоговых оценок для передачи в Platonus файлом. */
export async function exportForPlatonus(periodId: string): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const grades = await prisma.periodGrade.findMany({
    where: { periodId, isFinalized: true },
    include: {
      course: { include: { discipline: true } },
      student: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
    },
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Итоговые оценки');
  sheet.columns = [
    { header: 'ID студента (Platonus)', key: 'studentExt', width: 24 },
    { header: 'ФИО', key: 'name', width: 34 },
    { header: 'Код дисциплины', key: 'disciplineCode', width: 18 },
    { header: 'Рейтинг допуска', key: 'admission', width: 18 },
    { header: 'Экзамен', key: 'exam', width: 12 },
    { header: 'Итоговый балл', key: 'final', width: 16 },
    { header: 'Буквенная оценка', key: 'letter', width: 18 },
    { header: 'Цифровой эквивалент', key: 'gpa', width: 20 },
    { header: 'Традиционная', key: 'traditional', width: 22 },
  ];
  styleHeader(sheet.getRow(1));

  for (const g of grades) {
    sheet.addRow({
      studentExt: g.student.platonusId ?? '',
      name: `${g.student.user.lastNameRu} ${g.student.user.firstNameRu}`,
      disciplineCode: g.course.discipline.code,
      admission: decOrNull(g.admissionScore),
      exam: decOrNull(g.examScore),
      final: decOrNull(g.finalScore),
      letter: g.letter,
      gpa: decOrNull(g.gpaPoints),
      traditional: g.traditional,
    });
  }

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    fileName: `Platonus_итоговые_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}
