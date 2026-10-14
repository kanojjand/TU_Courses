import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { exportBatches } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { batchSheetRows } from '@/lib/grades';
import { FileAdapter } from '@/lib/platonus/adapter';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';

/** Все ведомости «готово к отправке» одним файлом — одна таблица для загрузки в Platonus */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.roles.some((r) => r.role === 'registrar' || r.role === 'admin')) return new NextResponse('Forbidden', { status: 403 });
  const ready = await db.select({ id: exportBatches.id }).from(exportBatches).where(eq(exportBatches.status, 'ready'));
  const all = [];
  for (const b of ready) {
    const d = await batchSheetRows(b.id);
    if (d) all.push(...d.rows);
  }
  const m = FileAdapter.sheetMatrix(all);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buildXlsx([{ name: 'grades', header: m.header, rows: m.rows }]) as BodyInit, {
    headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="grades_${stamp}.xlsx"` },
  });
}
