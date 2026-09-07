'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher, requirePermission } from '@/server/guards';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { weeklyAttendance } from '@/server/attendance';
import { enqueueAttendance } from '@/integration/platonus/outbox';

/**
 * Журнал посещаемости — F-LRN-06.
 *
 * Отметки ставит преподаватель курса. Офис Регистратора вправе править
 * их и после: пропуск по уважительной причине подтверждается документом,
 * который приносят позже занятия.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/teach/courses/[id]/attendance', 'page');
  revalidatePath('/[locale]/my/courses/[id]', 'page');
  revalidatePath('/[locale]/my/grades', 'page');
}

const sessionSchema = z.object({
  courseId: z.string().trim().min(1),
  id: z.string().trim().optional(),
  heldOn: z.string().trim().min(1, 'Укажите дату занятия.'),
  startsAt: z.string().trim().max(5).optional(),
  lessonKind: z.enum(['LECTURE', 'PRACTICE', 'LAB', 'SRSP', 'CONSULT', 'EXAM']),
  moduleId: z.string().trim().optional(),
  topic: z.string().trim().max(300).optional(),
});

export type SaveSessionInput = z.input<typeof sessionSchema>;

/** Создание или правка занятия в журнале */
export async function saveAttendanceSession(
  input: SaveSessionInput
): Promise<Result<{ id: string }>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { courseId, id, heldOn, startsAt, moduleId, ...rest } = parsed.data;

  const { user } = await requireCourseTeacher(courseId);

  const data = {
    heldOn: new Date(heldOn),
    startsAt: startsAt || null,
    moduleId: moduleId || null,
    ...rest,
  };

  // Занятие различается датой, временем и видом: без этого повторная
  // отправка формы создавала бы дубли одного и того же занятия
  const duplicate = await prisma.attendanceSession.findFirst({
    where: {
      courseId,
      heldOn: data.heldOn,
      startsAt: data.startsAt,
      lessonKind: data.lessonKind,
      id: id ? { not: id } : undefined,
    },
    select: { id: true },
  });
  if (duplicate) return fail('Занятие с такой датой, временем и видом уже заведено.');

  const session = id
    ? await prisma.attendanceSession.update({ where: { id }, data, select: { id: true } })
    : await prisma.attendanceSession.create({
        data: { courseId, createdById: user.id, ...data },
        select: { id: true },
      });

  revalidate();
  return { ok: true, data: { id: session.id } };
}

export async function deleteAttendanceSession(
  courseId: string,
  sessionId: string
): Promise<Result> {
  await requireCourseTeacher(courseId);
  await prisma.attendanceSession.delete({ where: { id: sessionId } });
  revalidate();
  return { ok: true };
}

const markSchema = z.object({
  courseId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  marks: z
    .array(
      z.object({
        studentId: z.string().trim().min(1),
        state: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'ONLINE']),
        reason: z.string().trim().max(300).optional(),
      })
    )
    .min(1, 'Нет отметок для сохранения.')
    .max(500),
});

export type SaveMarksInput = z.input<typeof markSchema>;

/**
 * Простановка отметок по занятию.
 *
 * Отметки сохраняются пакетом, а не по одной: преподаватель заполняет
 * журнал целиком, и построчное сохранение давало бы полсотни запросов
 * на одно занятие.
 */
export async function saveAttendanceMarks(
  input: SaveMarksInput
): Promise<Result<{ saved: number }>> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте отметки.');
  const { courseId, sessionId, marks } = parsed.data;

  const { user } = await requireCourseTeacher(courseId);

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { courseId: true },
  });
  if (!session || session.courseId !== courseId) {
    return fail('Занятие относится к другому курсу.');
  }

  // Отмечать можно только зарегистрированных на курс
  const enrolled = await prisma.enrollment.findMany({
    where: { courseId, cancelledAt: null, studentId: { in: marks.map((m) => m.studentId) } },
    select: { studentId: true },
  });
  const allowed = new Set(enrolled.map((e) => e.studentId));
  const rows = marks.filter((m) => allowed.has(m.studentId));
  if (rows.length === 0) return fail('Ни один из обучающихся не зарегистрирован на курс.');

  await prisma.$transaction(
    rows.map((m) =>
      prisma.attendanceMark.upsert({
        where: { sessionId_studentId: { sessionId, studentId: m.studentId } },
        create: {
          sessionId,
          studentId: m.studentId,
          state: m.state,
          reason: m.reason || null,
          markedById: user.id,
        },
        update: {
          state: m.state,
          reason: m.reason || null,
          markedById: user.id,
          markedAt: new Date(),
        },
      })
    )
  );

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.ATTENDANCE_MARK,
    entityType: 'AttendanceSession',
    entityId: sessionId,
    newValue: { marks: rows.length },
  });

  revalidate();
  return { ok: true, data: { saved: rows.length } };
}

/**
 * F-LRN-06, п. 40 Типовых правил: постановка посещаемости за неделю
 * в очередь передачи в информационную систему уполномоченного органа.
 *
 * Источник — отметки преподавателя, а не активность в системе: активность
 * показывает вовлечённость, но посещаемостью занятий не является.
 */
export async function enqueueWeeklyAttendance(
  courseId: string,
  weekStart: string,
  weekEnd: string
): Promise<Result<{ queued: number }>> {
  const actor = await requirePermission('integration:manage');

  const from = new Date(weekStart);
  const to = new Date(weekEnd);
  if (!(to >= from)) return fail('Конец недели не может быть раньше начала.');

  const rows = await weeklyAttendance(courseId, from, to);
  if (rows.length === 0) {
    return fail('За выбранную неделю нет проведённых занятий с отметками.');
  }

  const queued = await enqueueAttendance(
    courseId,
    from,
    to,
    rows.map((r) => ({
      studentId: r.studentId,
      // Минуты активности здесь не при чём: в контракт передаётся факт
      // посещения, а поле активности остаётся для совместимости
      activeMinutes: 0,
      itemsCompleted: r.attendedSessions,
      attended: r.attended,
    }))
  );

  await writeAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AUDIT_ACTIONS.ATTENDANCE_ENQUEUE,
    entityType: 'Course',
    entityId: courseId,
    newValue: { weekStart, weekEnd, rows: rows.length, queued },
  });

  return { ok: true, data: { queued } };
}
