import 'server-only';
import ExcelJS from 'exceljs';

import { getCurriculum, validate } from '@/server/curriculum';
import { autoWidth, styleHeader } from './templates';
import { CONTROL_FORM_LABELS, CYCLE_LABELS, COMPONENT_LABELS } from '@/domain/goso';

/**
 * F-CUR-09. Выгрузка учебного плана в .xlsx.
 *
 * Структура повторяет форму ЖН-31-22 ФР 01: раздел с позициями плана,
 * реквизиты протокола Учёного совета и сводка соответствия ГОСО. Точное
 * оформление печатной формы согласуется с УМО — здесь важно, чтобы выгрузка
 * содержала все данные, необходимые для сверки.
 */
export async function exportCurriculum(
  id: string
): Promise<{ buffer: Buffer; fileName: string }> {
  const curriculum = await getCurriculum(id);
  if (!curriculum) throw new Error('Учебный план не найден.');

  const report = validate(curriculum);
  const moduleById = new Map(curriculum.modules.map((m) => [m.id, m]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Платформа онлайн-обучения';
  wb.created = new Date();

  // ── Лист «Учебный план» ─────────────────────────────────────────────────
  const sheet = wb.addWorksheet('Учебный план', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  sheet.mergeCells('A1:R1');
  sheet.getCell('A1').value = 'РАБОЧИЙ УЧЕБНЫЙ ПЛАН';
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:R2');
  sheet.getCell('A2').value =
    `${curriculum.program.code} «${curriculum.program.nameRu}» · ` +
    `год набора ${curriculum.admissionYear}, версия ${curriculum.version}`;
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('A3:R3');
  sheet.getCell('A3').value =
    `Профиль ГОСО: ${curriculum.gosoProfile.nameRu} · ` +
    `${curriculum.gosoProfile.totalCredits} кредитов, не менее ${curriculum.gosoProfile.totalHoursMin} часов` +
    (curriculum.councilProtocolNo
      ? ` · протокол Учёного совета № ${curriculum.councilProtocolNo}` +
        (curriculum.councilDate ? ` от ${curriculum.councilDate.toLocaleDateString('ru-RU')}` : '')
      : '');
  sheet.getCell('A3').alignment = { horizontal: 'center' };
  sheet.addRow([]);

  const header = sheet.addRow([
    'Шифр',
    'Модуль',
    'Код дисциплины',
    'Наименование дисциплины',
    'Цикл',
    'Компонент',
    'Кредиты',
    'Всего часов',
    'Лекции',
    'Практ.',
    'Лаб.',
    'Инд.',
    'СРС',
    'СРСП',
    'Практика',
    'Диплом',
    'Семестры',
    'Семестр контроля',
    'Форма контроля',
    'Курсовая',
    'Выбрать из',
    'Язык',
  ]);
  styleHeader(header);

  for (const slot of curriculum.slots) {
    const slotModule = slot.moduleId ? moduleById.get(slot.moduleId) : null;
    // Для позиции по выбору каждая дисциплина-альтернатива выводится
    // отдельной строкой, а объёмы указываются только у первой: так видно,
    // что кредиты позиции не суммируются по вариантам
    const options = slot.options.length > 0 ? slot.options : [null];
    options.forEach((option, i) => {
      sheet.addRow([
        i === 0 ? (slot.slotCode ?? '') : '',
        i === 0 ? (slotModule?.nameRu ?? '') : '',
        option?.discipline.code ?? '',
        option?.discipline.nameRu ?? '(дисциплина не выбрана)',
        i === 0 ? CYCLE_LABELS[slot.cycle] : '',
        i === 0 ? COMPONENT_LABELS[slot.component] : '',
        i === 0 ? Number(slot.credits) : '',
        i === 0 ? slot.totalHours : '',
        i === 0 ? slot.hoursLecture : '',
        i === 0 ? slot.hoursPractice : '',
        i === 0 ? slot.hoursLab : '',
        i === 0 ? slot.hoursIndividual : '',
        i === 0 ? slot.hoursSrs : '',
        i === 0 ? slot.hoursSrsp : '',
        i === 0 ? slot.hoursPracticeField : '',
        i === 0 ? slot.hoursThesis : '',
        i === 0 ? slot.terms.join(', ') : '',
        i === 0 ? (slot.controlTerm ?? '') : '',
        i === 0 ? CONTROL_FORM_LABELS[slot.controlForm] : '',
        i === 0 ? (slot.hasCourseWork ? 'да' : '') : '',
        i === 0 && slot.options.length > 1 ? `${slot.chooseN} из ${slot.options.length}` : '',
        i === 0 ? (slot.teachingLang ?? '') : '',
      ]);
    });
  }

  const totals = sheet.addRow([
    'ИТОГО',
    '',
    '',
    '',
    '',
    '',
    report.totals.credits,
    report.totals.hours,
  ]);
  totals.font = { bold: true };
  autoWidth(sheet);
  sheet.views = [{ state: 'frozen', ySplit: header.number }];

  // ── Лист «Соответствие ГОСО» (F-CUR-07) ─────────────────────────────────
  const check = wb.addWorksheet('Соответствие ГОСО');
  check.mergeCells('A1:F1');
  check.getCell('A1').value = 'Отчёт валидатора ГОСО';
  check.getCell('A1').font = { bold: true, size: 13 };
  check.addRow([]);

  const checkHeader = check.addRow([
    'Правило',
    'Показатель',
    'Требуется',
    'В плане',
    'Отклонение',
    'Итог',
  ]);
  styleHeader(checkHeader);

  for (const row of report.compliance) {
    check.addRow([
      row.rule,
      `${row.label}, ${row.unit === 'hours' ? 'часов' : 'кредитов'}`,
      `${row.isMinimum ? 'не менее ' : ''}${row.required}`,
      row.actual,
      row.delta,
      row.ok ? 'соответствует' : 'НЕ соответствует',
    ]);
  }

  check.addRow([]);
  check.addRow(['Практика, кредитов', report.totals.practice]);
  check.addRow(['Минор, кредитов', report.totals.minor]);
  check.addRow([
    'Заключение',
    report.valid
      ? 'План соответствует нормативам ГОСО'
      : `Блокирующих ошибок: ${report.errors.length}`,
  ]);

  if (report.findings.length > 0) {
    check.addRow([]);
    const findingsHeader = check.addRow(['Правило', 'Уровень', 'Замечание']);
    styleHeader(findingsHeader);
    for (const f of report.findings) {
      check.addRow([f.rule, f.level === 'ERROR' ? 'блокирующая' : 'предупреждение', f.message]);
    }
  }
  autoWidth(check, 10, 80);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const fileName =
    `Учебный план ${curriculum.program.code} ${curriculum.admissionYear} ` +
    `в${curriculum.version}.xlsx`;
  return { buffer, fileName };
}
