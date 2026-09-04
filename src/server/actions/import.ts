'use server';

import { revalidatePath } from 'next/cache';

import { requireCourseTeacher, requirePermission } from '@/server/guards';
import { createQuestion } from './questions';
import {
  importEnrollments,
  importUsers,
  parseQuestions,
  type ImportIssue,
  type ImportResult,
} from '@/server/xlsx/import';

/** Серверные действия импорта из XLSX — F-A-03, F-T-08, раздел 9.3. */

async function fileToBuffer(formData: FormData): Promise<Buffer> {
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('Файл не передан.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Ожидается файл формата .xlsx');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Размер файла импорта не должен превышать 20 МБ.');
  }
  return Buffer.from(await file.arrayBuffer());
}

/** F-T-08. Импорт вопросов в банк курса. */
export async function importQuestionsFromFile(
  formData: FormData
): Promise<{ created: number; issues: ImportIssue[] }> {
  const courseId = String(formData.get('courseId') ?? '');
  await requireCourseTeacher(courseId);

  const buffer = await fileToBuffer(formData);
  const { questions, issues } = await parseQuestions(buffer, courseId);

  let created = 0;
  for (const [index, question] of questions.entries()) {
    try {
      await createQuestion(question);
      created++;
    } catch (error) {
      issues.push({
        row: index + 2,
        message: error instanceof Error ? error.message : 'Ошибка сохранения вопроса',
      });
    }
  }

  revalidatePath(`/teach/courses/${courseId}/questions`);
  return { created, issues };
}

/** F-A-03. Импорт пользователей. Критерий приёмки № 11. */
export async function importUsersFromFile(
  formData: FormData
): Promise<ImportResult<{ email: string; password: string; name: string }[]>> {
  const user = await requirePermission('user:import');
  const buffer = await fileToBuffer(formData);
  const result = await importUsers(buffer, { id: user.id, email: user.email });
  revalidatePath('/admin/users');
  return result;
}

/** Раздел 9.3. Импорт регистраций на курсы (резервный файловый обмен). */
export async function importEnrollmentsFromFile(formData: FormData): Promise<ImportResult> {
  const user = await requirePermission('enrollment:manage');
  const buffer = await fileToBuffer(formData);
  const result = await importEnrollments(buffer, { id: user.id, email: user.email });
  revalidatePath('/admin/enrollments');
  return result;
}
