import 'server-only';
import ExcelJS from 'exceljs';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';
import { encryptIin, generatePassword, hashIin, isValidIin } from '@/lib/crypto';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import type { QuestionInput } from '@/server/actions/questions';

/**
 * Импорт из XLSX — F-A-03, F-T-08, раздел 9.3 (резервный файловый обмен).
 * Критерий приёмки № 11: импорт 100 пользователей выполняется без ошибок.
 */

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult<T = unknown> {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
  data?: T;
}

function cell(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

/** F-A-03. Импорт пользователей. Возвращает временные пароли для выдачи. */
export async function importUsers(
  buffer: Buffer,
  actor: { id: string; email: string }
): Promise<ImportResult<{ email: string; password: string; name: string }[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Файл не содержит листов.');

  const result: ImportResult<{ email: string; password: string; name: string }[]> = {
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    issues: [],
    data: [],
  };

  const [programs, departments, roles] = await Promise.all([
    prisma.educationProgram.findMany({ select: { id: true, code: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.role.findMany(),
  ]);

  const programByCode = new Map(programs.map((p) => [p.code.toUpperCase(), p.id]));
  const departmentByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const email = cell(row, 10).toLowerCase();
    if (!email) continue;

    result.total++;

    const iin = cell(row, 1);
    const roleCode = cell(row, 12).toUpperCase() || 'STUDENT';

    if (iin && !isValidIin(iin)) {
      result.issues.push({ row: rowNumber, field: 'ИИН', message: `Некорректный ИИН: ${iin}` });
      result.skipped++;
      continue;
    }
    if (!roleByCode.has(roleCode as never)) {
      result.issues.push({ row: rowNumber, field: 'Роль', message: `Неизвестная роль: ${roleCode}` });
      result.skipped++;
      continue;
    }

    const lastNameRu = cell(row, 5);
    const firstNameRu = cell(row, 6);
    if (!lastNameRu || !firstNameRu) {
      result.issues.push({ row: rowNumber, field: 'ФИО', message: 'Не заполнены фамилия или имя (ru)' });
      result.skipped++;
      continue;
    }

    const lastNameKk = cell(row, 2) || lastNameRu;
    const firstNameKk = cell(row, 3) || firstNameRu;

    try {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      const password = generatePassword();

      const user = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          iinEncrypted: iin ? encryptIin(iin) : null,
          iinHash: iin ? hashIin(iin) : null,
          lastNameKk,
          firstNameKk,
          middleNameKk: cell(row, 4) || null,
          lastNameRu,
          firstNameRu,
          middleNameRu: cell(row, 7) || null,
          lastNameEn: cell(row, 8) || lastNameRu,
          firstNameEn: cell(row, 9) || firstNameRu,
          phone: cell(row, 11) || null,
          passwordHash: await bcrypt.hash(password, 12),
          mustChangePassword: true,
          uiLanguage: (cell(row, 17).toUpperCase() || 'KK') as 'KK' | 'RU' | 'EN',
        },
        update: {
          lastNameKk,
          firstNameKk,
          middleNameKk: cell(row, 4) || null,
          lastNameRu,
          firstNameRu,
          middleNameRu: cell(row, 7) || null,
          lastNameEn: cell(row, 8) || lastNameRu,
          firstNameEn: cell(row, 9) || firstNameRu,
          phone: cell(row, 11) || null,
        },
      });

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleByCode.get(roleCode as never)! } },
        create: { userId: user.id, roleId: roleByCode.get(roleCode as never)!, grantedBy: actor.id },
        update: {},
      });

      if (roleCode === 'STUDENT') {
        const programCode = cell(row, 13).toUpperCase();
        const programId = programByCode.get(programCode);
        if (!programId) {
          result.issues.push({
            row: rowNumber,
            field: 'Код ОП',
            message: `Образовательная программа не найдена: ${programCode}`,
          });
          result.skipped++;
          continue;
        }

        const groupName = cell(row, 14);
        let groupId: string | null = null;
        if (groupName) {
          const group = await prisma.studyGroup.upsert({
            where: { programId_name: { programId, name: groupName } },
            create: {
              programId,
              name: groupName,
              studyYear: Number(cell(row, 15)) || 1,
              language: (cell(row, 17).toUpperCase() || 'RU') as 'KK' | 'RU' | 'EN',
              studyForm: (cell(row, 16).toUpperCase() || 'DISTANCE') as never,
            },
            update: {},
          });
          groupId = group.id;
        }

        await prisma.studentProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            programId,
            groupId,
            studyYear: Number(cell(row, 15)) || 1,
            studyForm: (cell(row, 16).toUpperCase() || 'DISTANCE') as never,
            language: (cell(row, 17).toUpperCase() || 'RU') as 'KK' | 'RU' | 'EN',
            admissionYear: Number(cell(row, 18)) || new Date().getFullYear(),
            platonusId: cell(row, 21) || null,
          },
          update: { programId, groupId, studyYear: Number(cell(row, 15)) || 1 },
        });
      }

      if (roleCode === 'TEACHER' || roleCode === 'TUTOR' || roleCode === 'METHODIST' || roleCode === 'ADVISOR') {
        const departmentCode = cell(row, 19).toUpperCase();
        const departmentId = departmentByCode.get(departmentCode);
        if (!departmentId) {
          result.issues.push({
            row: rowNumber,
            field: 'Код кафедры',
            message: `Кафедра не найдена: ${departmentCode}`,
          });
          result.skipped++;
          continue;
        }
        await prisma.teacherProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            departmentId,
            position: cell(row, 20) || 'преподаватель',
            platonusId: cell(row, 21) || null,
          },
          update: { departmentId, position: cell(row, 20) || 'преподаватель' },
        });
      }

      if (existing) {
        result.updated++;
      } else {
        result.created++;
        result.data!.push({
          email,
          password,
          name: `${lastNameRu} ${firstNameRu}`,
        });
      }
    } catch (error) {
      result.issues.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Ошибка обработки строки',
      });
      result.skipped++;
    }
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.USER_IMPORT,
    entityType: 'User',
    newValue: {
      total: result.total,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    },
  });

  return result;
}

/** F-T-08. Импорт вопросов из XLSX по шаблону. */
export async function parseQuestions(
  buffer: Buffer,
  courseId: string
): Promise<{ questions: QuestionInput[]; issues: ImportIssue[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Файл не содержит листов.');

  const questions: QuestionInput[] = [];
  const issues: ImportIssue[] = [];

  const VALID_TYPES = [
    'SINGLE_CHOICE',
    'MULTI_CHOICE',
    'TRUE_FALSE',
    'SHORT_ANSWER',
    'MATCHING',
    'ORDERING',
  ] as const;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const type = cell(row, 1).toUpperCase();
    const text = cell(row, 5);
    if (!type && !text) continue;

    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      issues.push({ row: rowNumber, field: 'Тип', message: `Неизвестный тип вопроса: ${type}` });
      continue;
    }
    if (!text) {
      issues.push({ row: rowNumber, field: 'Текст вопроса', message: 'Не заполнен текст вопроса' });
      continue;
    }

    const rawOptions = [6, 7, 8, 9, 10].map((i) => cell(row, i)).filter(Boolean);
    const correctIdx = new Set(
      cell(row, 11)
        .split(/[,;]/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    );

    const base = {
      courseId,
      topicName: cell(row, 2) || undefined,
      difficulty: (cell(row, 3).toUpperCase() || 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD',
      type: type as QuestionInput['type'],
      text,
      explanation: cell(row, 12) || undefined,
      defaultPoints: Number(cell(row, 4)) || 1,
      options: [] as QuestionInput['options'],
    };

    try {
      if (type === 'SHORT_ANSWER') {
        questions.push({ ...base, answers: rawOptions, caseSensitive: false });
      } else if (type === 'MATCHING') {
        // Формат ячейки: «левое=правое»
        const pairs = rawOptions.map((o) => {
          const [left, right] = o.split('=').map((s) => s.trim());
          if (!left || !right) throw new Error(`Некорректная пара соответствия: «${o}»`);
          return { text: left, isCorrect: true, matchKey: right };
        });
        questions.push({ ...base, options: pairs });
      } else if (type === 'ORDERING') {
        questions.push({
          ...base,
          options: rawOptions.map((o) => ({ text: o, isCorrect: true, matchKey: null })),
        });
      } else {
        if (correctIdx.size === 0) throw new Error('Не указаны номера верных вариантов');
        questions.push({
          ...base,
          options: rawOptions.map((o, i) => ({
            text: o,
            isCorrect: correctIdx.has(i + 1),
            matchKey: null,
          })),
        });
      }
    } catch (error) {
      issues.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Ошибка разбора строки',
      });
    }
  }

  return { questions, issues };
}

/** Раздел 9.3. Импорт регистраций на курсы из XLSX (резервный обмен). */
export async function importEnrollments(
  buffer: Buffer,
  actor: { id: string; email: string }
): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('Файл не содержит листов.');

  const result: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, issues: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const iin = cell(row, 1);
    const email = cell(row, 2).toLowerCase();
    const disciplineCode = cell(row, 3);
    const periodName = cell(row, 4);
    const academicYear = cell(row, 5);
    const streamName = cell(row, 6) || null;

    if (!disciplineCode && !iin && !email) continue;
    result.total++;

    try {
      const user = await prisma.user.findFirst({
        where: iin ? { iinHash: hashIin(iin) } : { email },
        select: { studentProfile: { select: { id: true } } },
      });

      if (!user?.studentProfile) {
        result.issues.push({ row: rowNumber, message: `Студент не найден: ${iin || email}` });
        result.skipped++;
        continue;
      }

      const period = await prisma.academicPeriod.findFirst({
        where: { name: periodName, academicYear: { name: academicYear } },
        select: { id: true },
      });
      if (!period) {
        result.issues.push({
          row: rowNumber,
          message: `Академический период не найден: ${academicYear} ${periodName}`,
        });
        result.skipped++;
        continue;
      }

      const discipline = await prisma.discipline.findUnique({
        where: { code: disciplineCode },
        select: { id: true },
      });
      if (!discipline) {
        result.issues.push({ row: rowNumber, message: `Дисциплина не найдена: ${disciplineCode}` });
        result.skipped++;
        continue;
      }

      const course = await prisma.course.findFirst({
        where: { disciplineId: discipline.id, periodId: period.id, streamName },
        select: { id: true },
      });
      if (!course) {
        result.issues.push({
          row: rowNumber,
          message: `Курс не создан для дисциплины ${disciplineCode} в периоде ${periodName}`,
        });
        result.skipped++;
        continue;
      }

      const existing = await prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: user.studentProfile.id } },
      });

      await prisma.enrollment.upsert({
        where: { courseId_studentId: { courseId: course.id, studentId: user.studentProfile.id } },
        create: {
          courseId: course.id,
          studentId: user.studentProfile.id,
          source: 'xlsx',
        },
        update: { cancelledAt: null },
      });

      if (existing) result.updated++;
      else result.created++;
    } catch (error) {
      result.issues.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Ошибка обработки строки',
      });
      result.skipped++;
    }
  }

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ENROLLMENT_CREATE,
    entityType: 'Enrollment',
    newValue: { source: 'xlsx', ...result },
  });

  return result;
}
