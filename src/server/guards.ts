import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  can,
  canAny,
  hasRole,
  homeRouteFor,
  type Permission,
  type RoleCode,
  type SessionUser,
} from '@/lib/rbac';

/**
 * Проверки доступа для серверных компонентов и серверных действий — раздел 3 ТЗ.
 *
 * Каждая функция кроме проверки роли выполняет проверку принадлежности к
 * объекту: преподаватель получает доступ только к назначенным ему курсам,
 * студент — только к курсам, на которые он зарегистрирован.
 */

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' = 'FORBIDDEN'
  ) {
    super(message);
    this.name = 'AccessError';
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: session.user.roles as RoleCode[],
    uiLanguage: session.user.uiLanguage as 'KK' | 'RU' | 'EN',
    studentProfileId: session.user.studentProfileId,
    teacherProfileId: session.user.teacherProfileId,
    departmentId: session.user.departmentId,
    hasConsent: session.user.hasConsent,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessError('Требуется вход в систему.', 'UNAUTHENTICATED');
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    throw new AccessError(`Недостаточно прав: ${permission}`);
  }
  return user;
}

/**
 * Проверка прав для страницы: при нехватке прав пользователь отправляется
 * в доступный ему раздел, а не получает ошибку.
 *
 * Почему не requirePermission: та бросает исключение, и страница отдаётся с
 * кодом 500. Next.js в продакшене вычищает текст серверных ошибок перед
 * передачей в error.tsx, поэтому отличить отказ доступа от настоящего сбоя
 * на клиенте невозможно — вместо «Доступ запрещён» показывалось бы
 * «Ошибка сервера». Для страниц это неверно вдвойне: переход по ссылке или
 * кнопке «назад» — обычное действие пользователя, а не сбой.
 *
 * Для серверных действий и API по-прежнему используется requirePermission:
 * там исключение уместно.
 *
 * Достаточно одного права из перечисленных.
 */
export async function requirePageAccess(
  locale: string,
  ...permissions: Permission[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAny(user, permissions)) {
    redirect(`/${locale}${homeRouteFor(user)}`);
  }
  return user;
}

export async function requireRole(...roles: RoleCode[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, ...roles)) {
    throw new AccessError(`Требуется роль: ${roles.join(' или ')}`);
  }
  return user;
}

/**
 * Доступ преподавателя к курсу.
 * Наличие роли «Преподаватель» доступа не даёт — нужно назначение на курс.
 * Администратор и офис регистратора имеют доступ ко всем курсам.
 */
export async function requireCourseTeacher(
  courseId: string
): Promise<{ user: SessionUser; isLead: boolean; isAssistant: boolean; readOnly: boolean }> {
  const user = await requireUser();

  if (hasRole(user, 'ADMIN', 'REGISTRAR', 'METHODIST')) {
    return { user, isLead: false, isAssistant: false, readOnly: !hasRole(user, 'ADMIN') };
  }

  if (!user.teacherProfileId) {
    throw new AccessError('Профиль преподавателя не найден.');
  }

  const link = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: user.teacherProfileId } },
  });

  if (!link) {
    throw new AccessError('Вы не назначены на этот курс в данном академическом периоде.');
  }

  return { user, isLead: link.isLead, isAssistant: link.isAssistant, readOnly: false };
}

/**
 * Доступ студента к курсу — только при действующей регистрации.
 * Студент видит курсы текущего и прошедших периодов (раздел 3).
 */
export async function requireEnrolledStudent(
  courseId: string
): Promise<{ user: SessionUser; studentId: string; enrollmentId: string }> {
  const user = await requireUser();
  if (!user.studentProfileId) throw new AccessError('Профиль обучающегося не найден.');

  // Повторное изучение даёт вторую регистрацию на тот же курс (R-16),
  // поэтому берём действующую, а не единственную
  const enrollment = await prisma.enrollment.findFirst({
    where: { courseId, studentId: user.studentProfileId, cancelledAt: null },
    include: { course: { select: { status: true } } },
    orderBy: { attemptNo: 'desc' },
  });

  if (!enrollment) {
    throw new AccessError('Вы не зарегистрированы на эту дисциплину.');
  }

  if (enrollment.course.status !== 'PUBLISHED' && enrollment.course.status !== 'ARCHIVED') {
    throw new AccessError('Курс ещё не опубликован.');
  }

  return { user, studentId: user.studentProfileId, enrollmentId: enrollment.id };
}

/** Доступ к курсу на чтение: преподаватель курса, зачисленный студент или админ */
export async function canViewCourseContent(courseId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (hasRole(user, 'ADMIN', 'REGISTRAR', 'METHODIST')) return true;
  if (user.teacherProfileId) {
    const link = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: user.teacherProfileId } },
      select: { id: true },
    });
    if (link) return true;
  }
  if (user.studentProfileId) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, studentId: user.studentProfileId, cancelledAt: null },
      select: { id: true },
    });
    if (enrollment) return true;
  }
  return false;
}

/**
 * Эдвайзер видит прогресс только закреплённых за ним студентов,
 * без права редактирования оценок.
 */
export async function requireAdviseeAccess(studentId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (hasRole(user, 'ADMIN', 'REGISTRAR')) return user;
  if (!hasRole(user, 'ADVISOR') || !user.teacherProfileId) {
    throw new AccessError('Недостаточно прав для просмотра данных обучающегося.');
  }
  const student = await prisma.studentProfile.findFirst({
    where: { id: studentId, advisorId: user.teacherProfileId },
    select: { id: true },
  });
  if (!student) throw new AccessError('Обучающийся не закреплён за вами.');
  return user;
}

/**
 * Преподаватель не видит персональные данные студентов вне своих учебных потоков
 * (раздел 3). Возвращает список id студентов, доступных пользователю.
 */
export async function visibleStudentIds(user: SessionUser): Promise<string[] | 'ALL'> {
  if (hasRole(user, 'ADMIN', 'REGISTRAR')) return 'ALL';

  const ids = new Set<string>();

  if (user.teacherProfileId) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        cancelledAt: null,
        course: { teachers: { some: { teacherId: user.teacherProfileId } } },
      },
      select: { studentId: true },
    });
    for (const e of enrollments) ids.add(e.studentId);

    const advisees = await prisma.studentProfile.findMany({
      where: { advisorId: user.teacherProfileId },
      select: { id: true },
    });
    for (const a of advisees) ids.add(a.id);
  }

  if (user.studentProfileId) ids.add(user.studentProfileId);

  return [...ids];
}

/** Ведомость закрыта — правка запрещена всем, кроме офиса регистратора с основанием */
export async function assertGradeEditable(
  courseId: string,
  controlPeriod: 'RK1' | 'RK2' | 'EXAM',
  user: SessionUser,
  reason?: string
): Promise<void> {
  const sheet = await prisma.gradeSheet.findUnique({
    where: { courseId_controlPeriod: { courseId, controlPeriod } },
    select: { status: true },
  });

  if (sheet?.status !== 'CLOSED') return;

  if (!can(user, 'grade:edit_after_close')) {
    throw new AccessError(
      'Ведомость закрыта. Корректировка выполняется только офисом регистратора.'
    );
  }
  if (!reason || reason.trim().length < 10) {
    throw new AccessError(
      'Корректировка после закрытия ведомости требует указания основания (не менее 10 символов).'
    );
  }
}
