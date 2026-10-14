'use server';

import { and, asc, eq, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, type Tx } from '@/db';
import { assignments, lessonBlocks, lessons, modules, questionBanks, questionOptions, questions, quizzes, type BlockType } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { courseAccess } from '@/lib/course';
import { parseCourseTable, type TableModule } from '@/lib/import/course-table';
import { parseQuizRows, type ParsedQuestion, type QuizRowError } from '@/lib/import/quiz-table';
import { readTables } from '@/lib/platonus/tabular';
import { cleanHtml } from '@/lib/sanitize';
import { isUuid } from '@/lib/utils';

async function editable(courseId: string) {
  const user = await requireUser();
  if (!isUuid(courseId)) throw new Error('BAD_REQUEST');
  const acc = await courseAccess(user, courseId);
  if (!acc.canEdit) throw new Error('FORBIDDEN');
  return user;
}

/** Чтение course.xlsx / course.csv: строки уходят обратно в браузер для проверки файлов */
export async function readCourseTableAction(form: FormData) {
  await requireUser();
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'noFile' as const };
  try {
    const [table] = await readTables(file.name, Buffer.from(await file.arrayBuffer()));
    return { rows: table?.rows ?? [] };
  } catch {
    return { error: 'unreadable' as const };
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = (s: string) => (/<[a-z][\s\S]*>/i.test(s) ? cleanHtml(s) : s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));

export type CreatedBlock = { rowNo: number; blockId: string; type: BlockType; value: string; title: string };

/**
 * Создание структуры курса из таблицы. Модули добавляются после существующих.
 * Возвращает блоки, для которых браузер догрузит файлы (видео, PDF, тесты).
 */
export async function applyCourseTableAction(courseId: string, input: TableModule[]): Promise<{ blocks: CreatedBlock[] }> {
  const user = await editable(courseId);
  // Перепроверяем структуру на сервере: доверяем только типам и числам после разбора
  const rows = input.flatMap((m) =>
    m.lessons.flatMap((l) =>
      l.blocks.map((b) => ({
        module_no: String(m.no),
        week: String(m.week),
        module_title: m.title,
        lesson_no: String(l.no),
        lesson_title: l.title,
        block_no: String(b.no),
        block_type: b.type,
        block_title: b.title,
        file_or_text: b.value,
        required: b.required ? 'yes' : 'no',
      })),
    ),
  );
  const { modules: tree } = parseCourseTable(rows);
  const rowNoOf = new Map(input.flatMap((m) => m.lessons.flatMap((l) => l.blocks.map((b) => [`${m.no}|${l.no}|${b.no}|${b.value}`, b.rowNo] as const))));
  const created: CreatedBlock[] = [];
  await db.transaction(async (tx) => {
    const [mx] = await tx.select({ p: max(modules.position) }).from(modules).where(eq(modules.courseId, courseId));
    let pos = (mx?.p ?? -1) + 1;
    for (const m of tree) {
      const [mod] = await tx.insert(modules).values({ courseId, week: m.week, position: pos++, title: m.title.slice(0, 200) }).returning();
      for (const [li, l] of m.lessons.entries()) {
        const [les] = await tx.insert(lessons).values({ moduleId: mod.id, position: li, title: l.title.slice(0, 200), required: true }).returning();
        for (const [bi, b] of l.blocks.entries()) {
          const data =
            b.type === 'text' ? { html: textToHtml(b.value) } : b.type === 'link' ? { url: /^https?:\/\//i.test(b.value) ? b.value : `https://${b.value}` } : {};
          const [blk] = await tx
            .insert(lessonBlocks)
            .values({ lessonId: les.id, position: bi, type: b.type, title: b.title.slice(0, 300), required: b.required, data })
            .returning();
          if (b.type === 'quiz') await tx.insert(quizzes).values({ blockId: blk.id });
          if (b.type === 'assignment') await tx.insert(assignments).values({ blockId: blk.id, instructions: b.value || null });
          if (b.type === 'video' || b.type === 'file' || b.type === 'quiz')
            created.push({ rowNo: rowNoOf.get(`${m.no}|${l.no}|${b.no}|${b.value}`) ?? 0, blockId: blk.id, type: b.type, value: b.value, title: b.title });
        }
      }
    }
  });
  await audit(user.id, 'course.import_table', 'course', courseId, null, { modules: tree.length, blocks: created.length });
  revalidatePath(`/studio/${courseId}`);
  return { blocks: created };
}

/* ───────────────────────── Тесты из Excel ───────────────────────── */

async function insertQuestions(tx: Tx, bankId: string, qs: ParsedQuestion[]) {
  for (const q of qs) {
    const [row] = await tx
      .insert(questions)
      .values({ bankId, type: q.type, text: q.text.slice(0, 4000), difficulty: q.difficulty, data: q.answers ? { answers: q.answers } : {} })
      .returning();
    if (q.options.length)
      await tx.insert(questionOptions).values(q.options.map((o, i) => ({ questionId: row.id, text: o.text.slice(0, 2000), isCorrect: o.isCorrect, matchText: o.matchText, position: i })));
  }
}

/**
 * Загрузка банка вопросов из Excel/CSV. Если указан блок теста — банк
 * привязывается к нему, и тест берёт все вопросы банка.
 */
export async function importQuizFileAction(courseId: string, form: FormData): Promise<{ count: number; errors: QuizRowError[]; bankId?: string } | { error: string }> {
  const user = await editable(courseId);
  const file = form.get('file');
  const blockId = String(form.get('blockId') ?? '');
  const bankIdIn = String(form.get('bankId') ?? '');
  const title = String(form.get('title') ?? '').trim();
  if (!(file instanceof File)) return { error: 'noFile' };
  let rows: Record<string, string>[];
  try {
    rows = (await readTables(file.name, Buffer.from(await file.arrayBuffer())))[0]?.rows ?? [];
  } catch {
    return { error: 'unreadable' };
  }
  const { questions: parsed, errors } = parseQuizRows(rows);
  if (!parsed.length) return { count: 0, errors };
  let bankId = '';
  await db.transaction(async (tx) => {
    if (isUuid(bankIdIn)) {
      const [b] = await tx.select().from(questionBanks).where(and(eq(questionBanks.id, bankIdIn), eq(questionBanks.courseId, courseId)));
      if (!b) throw new Error('FORBIDDEN');
      bankId = b.id;
    } else {
      const [b] = await tx
        .insert(questionBanks)
        .values({ courseId, title: (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 200) })
        .returning();
      bankId = b.id;
    }
    await insertQuestions(tx, bankId, parsed);
    if (isUuid(blockId)) {
      const by = (d: number) => parsed.filter((q) => q.difficulty === d).length;
      await tx
        .update(quizzes)
        .set({ bankId, countEasy: by(1), countMedium: by(2), countHard: by(3) })
        .where(eq(quizzes.blockId, blockId));
    }
  });
  await audit(user.id, 'questions.import', 'question_bank', bankId, null, { count: parsed.length, errors: errors.length });
  revalidatePath(`/studio/${courseId}/questions`);
  return { count: parsed.length, errors, bankId };
}

/* ───────────────────────── Папка с видео ───────────────────────── */

/**
 * Видео по шаблону КОД_M01_L03.mp4: ролик ложится в модуль 1, урок 3.
 * Недостающие модули и уроки создаются пустыми (раздел 6, способ 2).
 */
export async function applyVideoFolderAction(
  courseId: string,
  items: { filename: string; module: number; lesson: number; part: number }[],
): Promise<{ files: { filename: string; blockId: string }[] }> {
  const user = await editable(courseId);
  const out: { filename: string; blockId: string }[] = [];
  const sorted = [...items].filter((i) => i.module >= 1 && i.module <= 100 && i.lesson >= 1 && i.lesson <= 100).sort((a, b) => a.module - b.module || a.lesson - b.lesson || a.part - b.part);
  await db.transaction(async (tx) => {
    const mods = await tx.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(asc(modules.position));
    for (const it of sorted) {
      while (mods.length < it.module) {
        const n = mods.length + 1;
        const [m] = await tx.insert(modules).values({ courseId, week: n, position: n - 1, title: `Модуль ${n}` }).returning();
        mods.push(m);
      }
      const mod = mods[it.module - 1];
      const ls = await tx.select().from(lessons).where(eq(lessons.moduleId, mod.id)).orderBy(asc(lessons.position));
      while (ls.length < it.lesson) {
        const n = ls.length + 1;
        const [l] = await tx.insert(lessons).values({ moduleId: mod.id, position: n - 1, title: `Урок ${n}`, required: true }).returning();
        ls.push(l);
      }
      const les = ls[it.lesson - 1];
      const [mx] = await tx.select({ p: max(lessonBlocks.position) }).from(lessonBlocks).where(eq(lessonBlocks.lessonId, les.id));
      const [blk] = await tx
        .insert(lessonBlocks)
        .values({ lessonId: les.id, position: (mx?.p ?? -1) + 1, type: 'video', title: it.part > 1 ? `Видео, часть ${it.part}` : 'Видео', required: true, data: {} })
        .returning();
      out.push({ filename: it.filename, blockId: blk.id });
    }
  });
  await audit(user.id, 'course.import_videos', 'course', courseId, null, { files: out.length });
  revalidatePath(`/studio/${courseId}`);
  return { files: out };
}
