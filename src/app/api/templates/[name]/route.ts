import { NextResponse } from 'next/server';
import { COURSE_COLUMNS, COURSE_TEMPLATE_ROWS } from '@/lib/import/course-table';
import { QUIZ_TEMPLATE_HEADER, QUIZ_TEMPLATE_ROWS } from '@/lib/import/quiz-table';
import { FORMATS, IMPORT_KINDS, type ImportKind } from '@/lib/platonus/formats';
import { buildCsv, buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';

/**
 * Шаблоны файлов: course.csv для загрузки курса, quiz.xlsx для банка вопросов,
 * и шаблоны обмена с Platonus (раздел 5.2) — CSV в UTF-8 с BOM.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (name === 'course') {
    return new NextResponse(buildCsv(COURSE_COLUMNS, COURSE_TEMPLATE_ROWS), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="course.csv"' },
    });
  }
  if (name === 'quiz') {
    const data = buildXlsx([{ name: 'questions', header: QUIZ_TEMPLATE_HEADER, rows: QUIZ_TEMPLATE_ROWS }]);
    return new NextResponse(data as BodyInit, { headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': 'attachment; filename="quiz.xlsx"' } });
  }
  if ((IMPORT_KINDS as readonly string[]).includes(name)) {
    const spec = FORMATS[name as ImportKind];
    return new NextResponse(buildCsv(spec.map((c) => c.key), [spec.map((c) => c.example)]), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` },
    });
  }
  return new NextResponse('Not found', { status: 404 });
}
