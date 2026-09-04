import 'server-only';
import { prisma, dec } from '@/lib/prisma';
import { idempotencyKey } from '@/lib/crypto';
import { getPlatonusClient } from './client';
import type {
  OutgoingAttendance,
  OutgoingCurrentControl,
  OutgoingFinalGrade,
  OutgoingMidterm,
} from './types';

/**
 * Очередь исходящих событий — раздел 9.1 ТЗ.
 *
 *  — асинхронность: недоступность Platonus не блокирует работу Платформы;
 *  — идемпотентность: каждое событие имеет уникальный ключ,
 *    повторная отправка не создаёт дубликатов;
 *  — экспоненциальная задержка между повторными попытками;
 *  — ручной контроль: передача итоговых оценок выполняется только
 *    по явному подтверждению офиса регистратора.
 */

/** Экспоненциальная задержка: 1, 2, 4, 8… минут, но не более 6 часов */
function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 60_000, 6 * 3600_000);
}

async function externalId(entityType: string, internalId: string): Promise<string | null> {
  const mapping = await prisma.integrationMapping.findUnique({
    where: {
      entityType_internalId_system: { entityType, internalId, system: 'platonus' },
    },
  });
  return mapping?.externalId ?? null;
}

/** Постановка события в очередь. Повторная постановка того же события игнорируется. */
export async function enqueue(params: {
  eventType: 'CURRENT_CONTROL_SCORES' | 'MIDTERM_RESULTS' | 'FINAL_GRADES' | 'ATTENDANCE';
  keyParts: (string | number)[];
  payload: unknown;
  requiresApproval?: boolean;
}): Promise<void> {
  await prisma.integrationOutbox.upsert({
    where: { idempotencyKey: idempotencyKey(params.eventType, ...params.keyParts) },
    create: {
      eventType: params.eventType,
      idempotencyKey: idempotencyKey(params.eventType, ...params.keyParts),
      payload: params.payload as never,
      requiresApproval: params.requiresApproval ?? false,
    },
    update: {},
  });
}

/** Баллы текущего контроля — еженедельно (раздел 9.2) */
export async function enqueueCurrentControl(courseId: string): Promise<number> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { disciplineId: true, periodId: true },
  });

  const [disciplineExt, periodExt] = await Promise.all([
    externalId('Discipline', course.disciplineId),
    externalId('AcademicPeriod', course.periodId),
  ]);
  if (!disciplineExt || !periodExt) return 0;

  const items = await prisma.gradeItem.findMany({
    where: { courseId },
    include: { grades: { include: { student: { select: { id: true, platonusId: true } } } } },
  });

  const byStudent = new Map<string, OutgoingCurrentControl>();

  for (const item of items) {
    for (const grade of item.grades) {
      const ext = grade.student.platonusId;
      if (!ext) continue;
      if (!byStudent.has(ext)) {
        byStudent.set(ext, {
          studentExternalId: ext,
          disciplineExternalId: disciplineExt,
          periodExternalId: periodExt,
          items: [],
        });
      }
      byStudent.get(ext)!.items.push({
        title: item.title,
        score: dec(grade.score),
        maxScore: dec(item.maxScore),
        date: grade.gradedAt.toISOString(),
      });
    }
  }

  const payload = [...byStudent.values()];
  if (payload.length === 0) return 0;

  const week = new Date().toISOString().slice(0, 10);
  await enqueue({
    eventType: 'CURRENT_CONTROL_SCORES',
    keyParts: [courseId, week],
    payload,
  });

  return payload.length;
}

/** Результаты РК1 / РК2 — по завершении периода контроля */
export async function enqueueMidterms(
  courseId: string,
  control: 'RK1' | 'RK2'
): Promise<number> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { disciplineId: true, periodId: true },
  });

  const [disciplineExt, periodExt] = await Promise.all([
    externalId('Discipline', course.disciplineId),
    externalId('AcademicPeriod', course.periodId),
  ]);
  if (!disciplineExt || !periodExt) return 0;

  const grades = await prisma.periodGrade.findMany({
    where: { courseId },
    include: { student: { select: { platonusId: true } } },
  });

  const payload: OutgoingMidterm[] = grades
    .filter((g) => g.student.platonusId && (control === 'RK1' ? g.rk1 : g.rk2) !== null)
    .map((g) => ({
      studentExternalId: g.student.platonusId!,
      disciplineExternalId: disciplineExt,
      periodExternalId: periodExt,
      control,
      score: dec(control === 'RK1' ? g.rk1 : g.rk2),
    }));

  if (payload.length === 0) return 0;

  await enqueue({ eventType: 'MIDTERM_RESULTS', keyParts: [courseId, control], payload });
  return payload.length;
}

/**
 * Итоговые оценки — только по явному подтверждению офиса регистратора
 * (раздел 9.1, п. 5). Это требование учебного процесса, а не техническое.
 */
export async function enqueueFinalGrades(courseId: string): Promise<number> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { disciplineId: true, periodId: true },
  });

  const [disciplineExt, periodExt] = await Promise.all([
    externalId('Discipline', course.disciplineId),
    externalId('AcademicPeriod', course.periodId),
  ]);
  if (!disciplineExt || !periodExt) return 0;

  const grades = await prisma.periodGrade.findMany({
    where: { courseId, isFinalized: true, letter: { not: null } },
    include: { student: { select: { platonusId: true } } },
  });

  const payload: OutgoingFinalGrade[] = grades
    .filter((g) => g.student.platonusId)
    .map((g) => ({
      studentExternalId: g.student.platonusId!,
      disciplineExternalId: disciplineExt,
      periodExternalId: periodExt,
      admissionScore: dec(g.admissionScore),
      examScore: dec(g.examScore),
      finalScore: dec(g.finalScore),
      letter: g.letter!,
      gpaPoints: dec(g.gpaPoints),
      traditional: g.traditional ?? '',
    }));

  if (payload.length === 0) return 0;

  await enqueue({
    eventType: 'FINAL_GRADES',
    keyParts: [courseId],
    payload,
    requiresApproval: true,
  });

  return payload.length;
}

/**
 * Учёт участия и посещаемости — еженедельно.
 * Передача данных о посещаемости в ИС МО обязательна по п. 40 Типовых правил.
 */
export async function enqueueAttendance(
  courseId: string,
  weekStart: Date,
  weekEnd: Date,
  rows: { studentId: string; activeMinutes: number; itemsCompleted: number; attended: boolean }[]
): Promise<number> {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { disciplineId: true, periodId: true },
  });

  const [disciplineExt, periodExt] = await Promise.all([
    externalId('Discipline', course.disciplineId),
    externalId('AcademicPeriod', course.periodId),
  ]);
  if (!disciplineExt || !periodExt) return 0;

  const students = await prisma.studentProfile.findMany({
    where: { id: { in: rows.map((r) => r.studentId) } },
    select: { id: true, platonusId: true },
  });
  const extById = new Map(students.map((s) => [s.id, s.platonusId]));

  const payload: OutgoingAttendance[] = rows
    .filter((r) => extById.get(r.studentId))
    .map((r) => ({
      studentExternalId: extById.get(r.studentId)!,
      disciplineExternalId: disciplineExt,
      periodExternalId: periodExt,
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      activeMinutes: r.activeMinutes,
      itemsCompleted: r.itemsCompleted,
      attended: r.attended,
    }));

  if (payload.length === 0) return 0;

  await enqueue({
    eventType: 'ATTENDANCE',
    keyParts: [courseId, weekStart.toISOString().slice(0, 10)],
    payload,
  });

  return payload.length;
}

export interface OutboxResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Обработка очереди. Вызывается по расписанию (Vercel Cron, каждые 10 минут).
 * Недоступность Platonus приводит к повторной попытке, а не к потере события.
 */
export async function processOutbox(batchSize = 20): Promise<OutboxResult> {
  const client = getPlatonusClient();

  if (client.mode !== 'http') {
    return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const pending = await prisma.integrationOutbox.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      nextAttemptAt: { lte: new Date() },
      // События, требующие подтверждения, не отправляются без него
      OR: [{ requiresApproval: false }, { approvedAt: { not: null } }],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  const result: OutboxResult = { processed: pending.length, sent: 0, failed: 0, skipped: 0 };

  for (const event of pending) {
    if (event.attempts >= event.maxAttempts) {
      await prisma.integrationOutbox.update({
        where: { id: event.id },
        data: { status: 'CANCELLED', lastError: 'Исчерпано число попыток' },
      });
      result.skipped++;
      continue;
    }

    await prisma.integrationOutbox.update({
      where: { id: event.id },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });

    try {
      // payload хранится как Json; структура гарантируется функциями enqueue*
      const payload = event.payload as unknown;

      switch (event.eventType) {
        case 'CURRENT_CONTROL_SCORES':
          await client.pushCurrentControl(payload as OutgoingCurrentControl[]);
          break;
        case 'MIDTERM_RESULTS':
          await client.pushMidterms(payload as OutgoingMidterm[]);
          break;
        case 'FINAL_GRADES':
          await client.pushFinalGrades(payload as OutgoingFinalGrade[]);
          break;
        case 'ATTENDANCE':
          await client.pushAttendance(payload as OutgoingAttendance[]);
          break;
      }

      await prisma.integrationOutbox.update({
        where: { id: event.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      result.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.integrationOutbox.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          lastError: message.slice(0, 2000),
          nextAttemptAt: new Date(Date.now() + backoffMs(event.attempts + 1)),
        },
      });
      result.failed++;
    }
  }

  return result;
}
