import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/server/guards';
import {
  buildEnrollmentsTemplate,
  buildQuestionsTemplate,
  buildUsersTemplate,
} from '@/server/xlsx/templates';

/** Шаблоны импорта — Приложения В и Г к ТЗ. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const { kind } = await params;

  let buffer: Buffer;
  let fileName: string;

  switch (kind) {
    case 'users':
      buffer = await buildUsersTemplate();
      fileName = 'Шаблон_импорта_пользователей.xlsx';
      break;
    case 'questions':
      buffer = await buildQuestionsTemplate();
      fileName = 'Шаблон_импорта_вопросов.xlsx';
      break;
    case 'enrollments':
      buffer = await buildEnrollmentsTemplate();
      fileName = 'Шаблон_импорта_регистраций.xlsx';
      break;
    default:
      return NextResponse.json({ error: 'Неизвестный шаблон.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
