import 'server-only';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  unreadCount,
  canPost,
  canModerate,
  isAddressed,
  isVisible,
  sortAnnouncements,
  type AudienceSpec,
} from '@/domain/chat';

/**
 * Чаты и объявления — чтение. Раздел 4.10 ТЗ.
 */

/**
 * Разговоры пользователя со счётчиком непрочитанных.
 *
 * Непрочитанные считаются запросом на количество, а не выборкой сообщений:
 * в чате группы за семестр их тысячи, и тянуть их ради счётчика незачем.
 */
export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null, conversation: { isArchived: false } },
    include: {
      conversation: {
        include: {
          group: { select: { name: true } },
          course: {
            select: {
              slug: true,
              discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
            },
          },
          department: { select: { nameRu: true } },
          faculty: { select: { nameRu: true } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              body: true,
              createdAt: true,
              author: { select: { lastNameRu: true, firstNameRu: true } },
            },
          },
          _count: { select: { members: { where: { leftAt: null } } } },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  });

  const unread = await unreadByConversation(userId, memberships);

  return memberships.map((m) => ({
    membership: m,
    unread: unread.get(m.conversationId) ?? 0,
  }));
}

/**
 * Непрочитанные по всем разговорам — одним запросом.
 *
 * Отметка прочтения у каждого разговора своя, поэтому `groupBy` строится
 * на списке условий «этот разговор позже этой отметки». Это один рейс к базе
 * вместо запроса на разговор: на транзакционном пуле с одним соединением
 * (см. `src/lib/prisma.ts`) запросы всё равно идут по очереди, и десять
 * разговоров превращались в десять последовательных ожиданий.
 */
async function unreadByConversation(
  userId: string,
  memberships: { conversationId: string; lastReadAt: Date | null }[]
): Promise<Map<string, number>> {
  if (memberships.length === 0) return new Map();

  const grouped = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      deletedAt: null,
      authorId: { not: userId },
      OR: memberships.map((m) => ({
        conversationId: m.conversationId,
        createdAt: m.lastReadAt ? { gt: m.lastReadAt } : undefined,
      })),
    },
    _count: { _all: true },
  });

  return new Map(grouped.map((g) => [g.conversationId, g._count._all]));
}

/** Общее число непрочитанных — для значка в шапке */
export async function totalUnread(userId: string): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId, leftAt: null, conversation: { isArchived: false } },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;

  const unread = await unreadByConversation(userId, memberships);
  let total = 0;
  for (const count of unread.values()) total += count;
  return total;
}

const messageInclude = {
  author: {
    select: { id: true, lastNameRu: true, firstNameRu: true, middleNameRu: true, avatarKey: true },
  },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: { select: { lastNameRu: true, firstNameRu: true } },
    },
  },
  attachments: true,
  reactions: {
    select: { emoji: true, userId: true },
  },
} satisfies Prisma.MessageInclude;

/**
 * Разговор с историей сообщений.
 *
 * Сообщения отдаются страницей с конца: открывая чат, читают последние,
 * а не первые за семестр. `before` листает вверх.
 */
export async function loadConversation(
  conversationId: string,
  userId: string,
  options: { take?: number; before?: Date; search?: string } = {}
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      group: { select: { id: true, name: true } },
      course: {
        select: {
          id: true,
          slug: true,
          discipline: { select: { code: true, nameKk: true, nameRu: true, nameEn: true } },
        },
      },
      department: { select: { nameRu: true } },
      faculty: { select: { nameRu: true } },
      members: {
        where: { leftAt: null },
        include: {
          user: { select: { id: true, lastNameRu: true, firstNameRu: true } },
        },
        orderBy: { user: { lastNameRu: 'asc' } },
      },
    },
  });
  if (!conversation) return null;

  const member = conversation.members.find((m) => m.userId === userId) ?? null;
  if (!member) return { conversation, member: null, messages: [], pinned: [] };

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      createdAt: options.before ? { lt: options.before } : undefined,
      // F-COM-03: поиск по истории разговора
      body: options.search ? { contains: options.search, mode: 'insensitive' } : undefined,
    },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: options.take ?? 50,
  });

  const pinned = await prisma.message.findMany({
    where: { conversationId, isPinned: true, deletedAt: null },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return {
    conversation,
    member,
    // В интерфейсе сообщения идут снизу вверх по времени
    messages: messages.reverse(),
    pinned,
  };
}

export { unreadCount, canPost, canModerate };

/**
 * Аудитория пользователя — по ней проверяется адресация объявлений.
 *
 * Собирается из профилей: обучающийся принадлежит группе, программе,
 * кафедре и факультету; преподаватель — кафедре и факультету, плюс
 * дисциплинам, которые ведёт.
 */
export async function loadAudience(userId: string): Promise<AudienceSpec> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      studentProfile: {
        select: {
          groupId: true,
          programId: true,
          program: { select: { departmentId: true, department: { select: { facultyId: true } } } },
          enrollments: {
            where: { cancelledAt: null },
            select: { courseId: true },
          },
        },
      },
      teacherProfile: {
        select: {
          departmentId: true,
          department: { select: { facultyId: true } },
          courses: { select: { courseId: true } },
        },
      },
    },
  });

  const facultyIds = new Set<string>();
  const departmentIds = new Set<string>();
  const programIds = new Set<string>();
  const groupIds = new Set<string>();
  const courseIds = new Set<string>();

  const s = user?.studentProfile;
  if (s) {
    if (s.groupId) groupIds.add(s.groupId);
    programIds.add(s.programId);
    departmentIds.add(s.program.departmentId);
    facultyIds.add(s.program.department.facultyId);
    for (const e of s.enrollments) courseIds.add(e.courseId);
  }

  const t = user?.teacherProfile;
  if (t) {
    departmentIds.add(t.departmentId);
    facultyIds.add(t.department.facultyId);
    for (const c of t.courses) courseIds.add(c.courseId);
  }

  return {
    facultyIds: [...facultyIds],
    departmentIds: [...departmentIds],
    programIds: [...programIds],
    groupIds: [...groupIds],
    courseIds: [...courseIds],
  };
}

/**
 * F-COM-05. Объявления, адресованные пользователю.
 *
 * Нормативное объявление об аккредитации показывается всем независимо
 * от адресации: п. 31 Типовых правил требует его публикации на главной
 * странице, а не рассылки по группам.
 */
export async function announcementsFor(userId: string, limit = 50) {
  const audience = await loadAudience(userId);

  const items = await prisma.announcement.findMany({
    where: { courseId: null },
    include: {
      targets: true,
      author: { select: { lastNameRu: true, firstNameRu: true } },
      acks: { where: { userId }, select: { acknowledgedAt: true } },
      _count: { select: { acks: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const visible = items.filter(
    (a) =>
      isVisible(a) &&
      (a.isNormative || isAddressed(a.targets.map((t) => ({ scope: t.scope, scopeId: t.scopeId })), audience))
  );

  return sortAnnouncements(visible).slice(0, limit);
}

/** Нормативные объявления для публичной части (F-COM-07) */
export async function normativeAnnouncements() {
  const items = await prisma.announcement.findMany({
    where: { isNormative: true, courseId: null },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      expiresAt: true,
      createdAt: true,
      isNormative: true,
      isPinned: true,
      isImportant: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  return sortAnnouncements(items.filter((a) => isVisible(a)));
}
