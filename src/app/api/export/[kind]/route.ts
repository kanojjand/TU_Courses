import { NextResponse } from 'next/server';

import { canViewCourseContent, getCurrentUser, requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import {
  exportAttendanceReport,
  exportForPlatonus,
  exportGradeSheet,
  exportInvalidCoursesReport,
  exportPerformanceReport,
} from '@/server/xlsx/export';

/** F-A-06, F-T-12. Экспорт ведомостей и отчётов в XLSX. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const { kind } = await params;
  const url = new URL(request.url);

  try {
    let payload: { buffer: Buffer; fileName: string };

    switch (kind) {
      case 'gradesheet': {
        const courseId = url.searchParams.get('courseId');
        const control = url.searchParams.get('control') as 'RK1' | 'RK2' | 'EXAM' | null;
        if (!courseId || !control) {
          return NextResponse.json({ error: 'Не указаны courseId и control.' }, { status: 400 });
        }
        if (!(await canViewCourseContent(courseId))) {
          return NextResponse.json({ error: 'Доступ запрещён.' }, { status: 403 });
        }
        payload = await exportGradeSheet(courseId, control);
        break;
      }

      case 'performance':
        await requirePermission('report:export');
        payload = await exportPerformanceReport({
          periodId: url.searchParams.get('periodId') ?? undefined,
          programId: url.searchParams.get('programId') ?? undefined,
          departmentId: url.searchParams.get('departmentId') ?? undefined,
          groupId: url.searchParams.get('groupId') ?? undefined,
        });
        break;

      case 'attendance': {
        await requirePermission('report:export');
        const periodId = url.searchParams.get('periodId');
        if (!periodId) {
          return NextResponse.json({ error: 'Не указан periodId.' }, { status: 400 });
        }
        payload = await exportAttendanceReport(periodId);
        break;
      }

      case 'invalid-courses':
        await requirePermission('report:export');
        payload = await exportInvalidCoursesReport();
        break;

      case 'platonus': {
        await requirePermission('integration:approve_final');
        const periodId = url.searchParams.get('periodId');
        if (!periodId) {
          return NextResponse.json({ error: 'Не указан periodId.' }, { status: 400 });
        }
        payload = await exportForPlatonus(periodId);
        break;
      }

      default:
        return NextResponse.json({ error: 'Неизвестный отчёт.' }, { status: 404 });
    }

    await writeAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.EXPORT_REPORT,
      entityType: 'Report',
      entityId: kind,
      newValue: Object.fromEntries(url.searchParams),
    });

    return new NextResponse(new Uint8Array(payload.buffer), {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(payload.fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка формирования отчёта';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
