import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { batchSheetRows } from '@/lib/grades';
import { FileAdapter } from '@/lib/platonus/adapter';
import { isUuid } from '@/lib/utils';
import { buildCsv, buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';

/** Ведомость для регистратора в формате раздела 5.2 (xlsx или csv) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  if (!isUuid(id)) return new NextResponse('Not found', { status: 404 });
  const data = await batchSheetRows(id);
  if (!data) return new NextResponse('Not found', { status: 404 });
  const allowed = user.roles.some((r) => ['registrar', 'admin', 'academic_office'].includes(r.role)) || data.offering.teacherId === user.id;
  if (!allowed) return new NextResponse('Forbidden', { status: 403 });
  const m = FileAdapter.sheetMatrix(data.rows);
  const name = `${data.discipline.code}_${data.offering.stream}_${data.batch.component}`.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    return new NextResponse(buildCsv(m.header, m.rows), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.csv` },
    });
  }
  return new NextResponse(buildXlsx([{ name: data.batch.component, header: m.header, rows: m.rows }]) as BodyInit, {
    headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.xlsx` },
  });
}
