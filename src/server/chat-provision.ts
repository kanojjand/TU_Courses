import { prisma } from '@/lib/prisma';

/**
 * Создание и синхронизация чатов групп и дисциплин — F-COM-01.
 *
 * Без `server-only`: модуль вызывается и из серверных действий, и из
 * сидов, которые запускаются обычным скриптом вне Next.js.
 *
 * Чат группы и чат курса не заводятся вручную: их состав определяется
 * составом группы и списком зарегистрированных. Функция идемпотентна и
 * вызывается после зачисления, перевода и регистрации на дисциплины.
 *
 * Вышедшие участники не удаляются, а помечаются датой выхода: их сообщения
 * остаются в истории, и запись об участии нужна, чтобы понимать, кто и когда
 * читал разговор.
 */

export interface ProvisionResult {
  conversationsCreated: number;
  membersAdded: number;
  membersRemoved: number;
}

/** Приводит состав участников разговора к целевому списку */
async function syncMembers(
  conversationId: string,
  target: { userId: string; role: 'OWNER' | 'MODERATOR' | 'MEMBER' }[]
): Promise<{ added: number; removed: number }> {
  const current = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { id: true, userId: true, role: true, leftAt: true },
  });
  const byUser = new Map(current.map((c) => [c.userId, c]));
  const targetIds = new Set(target.map((t) => t.userId));

  let added = 0;
  for (const t of target) {
    const existing = byUser.get(t.userId);
    if (!existing) {
      await prisma.conversationMember.create({
        data: { conversationId, userId: t.userId, role: t.role },
      });
      added++;
    } else if (existing.leftAt || existing.role !== t.role) {
      // Вернувшийся участник восстанавливается, а не заводится заново:
      // иначе терялась бы его отметка прочтения
      await prisma.conversationMember.update({
        where: { id: existing.id },
        data: { leftAt: null, role: t.role },
      });
      if (existing.leftAt) added++;
    }
  }

  let removed = 0;
  for (const c of current) {
    if (!targetIds.has(c.userId) && !c.leftAt) {
      await prisma.conversationMember.update({
        where: { id: c.id },
        data: { leftAt: new Date() },
      });
      removed++;
    }
  }

  return { added, removed };
}

/** Чат академической группы: куратор — владелец, обучающиеся — участники */
export async function provisionGroupChat(groupId: string): Promise<ProvisionResult> {
  const group = await prisma.studyGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      isActive: true,
      curator: { select: { userId: true } },
      students: {
        where: { status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY'] } },
        select: { userId: true },
      },
    },
  });
  if (!group || !group.isActive) {
    return { conversationsCreated: 0, membersAdded: 0, membersRemoved: 0 };
  }

  const existing = await prisma.conversation.findUnique({
    where: { kind_groupId: { kind: 'GROUP', groupId } },
    select: { id: true },
  });

  const conversation =
    existing ??
    (await prisma.conversation.create({
      data: { kind: 'GROUP', groupId, title: `Группа ${group.name}` },
      select: { id: true },
    }));

  const target: { userId: string; role: 'OWNER' | 'MEMBER' }[] = [
    ...(group.curator ? [{ userId: group.curator.userId, role: 'OWNER' as const }] : []),
    ...group.students.map((s) => ({ userId: s.userId, role: 'MEMBER' as const })),
  ];

  const { added, removed } = await syncMembers(conversation.id, target);
  return {
    conversationsCreated: existing ? 0 : 1,
    membersAdded: added,
    membersRemoved: removed,
  };
}

/**
 * Чат реализации дисциплины: ведущий преподаватель — владелец,
 * ассистенты — модераторы, зарегистрированные — участники.
 */
export async function provisionCourseChat(courseId: string): Promise<ProvisionResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      status: true,
      discipline: { select: { nameRu: true } },
      teachers: { select: { isLead: true, teacher: { select: { userId: true } } } },
      enrollments: {
        where: { cancelledAt: null, status: { in: ['REGISTERED', 'COMPLETED', 'RETAKE'] } },
        select: { student: { select: { userId: true } } },
      },
    },
  });
  // Чат заводится только у курса, доступного обучающимся: у черновика
  // состав ещё не определён
  if (!course || course.status === 'DRAFT' || course.status === 'ON_REVIEW') {
    return { conversationsCreated: 0, membersAdded: 0, membersRemoved: 0 };
  }

  const existing = await prisma.conversation.findUnique({
    where: { kind_courseId: { kind: 'COURSE', courseId } },
    select: { id: true },
  });

  const conversation =
    existing ??
    (await prisma.conversation.create({
      data: { kind: 'COURSE', courseId, title: course.discipline.nameRu },
      select: { id: true },
    }));

  const target: { userId: string; role: 'OWNER' | 'MODERATOR' | 'MEMBER' }[] = [
    ...course.teachers.map((t) => ({
      userId: t.teacher.userId,
      role: t.isLead ? ('OWNER' as const) : ('MODERATOR' as const),
    })),
    ...course.enrollments.map((e) => ({ userId: e.student.userId, role: 'MEMBER' as const })),
  ];

  const { added, removed } = await syncMembers(conversation.id, target);
  return {
    conversationsCreated: existing ? 0 : 1,
    membersAdded: added,
    membersRemoved: removed,
  };
}

/** Синхронизация всех чатов — запускается администратором и в сиде */
export async function provisionAll(): Promise<ProvisionResult> {
  const total: ProvisionResult = {
    conversationsCreated: 0,
    membersAdded: 0,
    membersRemoved: 0,
  };

  const groups = await prisma.studyGroup.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  for (const g of groups) {
    const r = await provisionGroupChat(g.id);
    total.conversationsCreated += r.conversationsCreated;
    total.membersAdded += r.membersAdded;
    total.membersRemoved += r.membersRemoved;
  }

  const courses = await prisma.course.findMany({
    where: { status: { in: ['APPROVED', 'PUBLISHED'] } },
    select: { id: true },
  });
  for (const c of courses) {
    const r = await provisionCourseChat(c.id);
    total.conversationsCreated += r.conversationsCreated;
    total.membersAdded += r.membersAdded;
    total.membersRemoved += r.membersRemoved;
  }

  return total;
}
