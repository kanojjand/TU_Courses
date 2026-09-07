/**
 * Чаты и объявления — раздел 4.10 ТЗ, требования F-COM-01…F-COM-08.
 *
 * Модуль чистый: правила «кто может писать», «кто может модерировать»
 * и подсчёт непрочитанных должны работать одинаково в интерфейсе,
 * в серверных действиях и в тестах.
 */

export type ConversationKindCode =
  | 'GROUP'
  | 'COURSE'
  | 'DIRECT'
  | 'DEPARTMENT'
  | 'FACULTY';

export type ConversationRoleCode = 'OWNER' | 'MODERATOR' | 'MEMBER';

export const CONVERSATION_KIND_LABELS: Record<ConversationKindCode, string> = {
  GROUP: 'чат группы',
  COURSE: 'чат дисциплины',
  DIRECT: 'личный диалог',
  DEPARTMENT: 'чат кафедры',
  FACULTY: 'чат факультета',
};

export interface MemberSpec {
  userId: string;
  role: ConversationRoleCode;
  lastReadAt: Date | null;
  leftAt: Date | null;
  isMuted: boolean;
}

export interface MessageSpec {
  id: string;
  authorId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

/**
 * F-COM-03. Непрочитанные сообщения участника.
 *
 * Свои сообщения не считаются непрочитанными, удалённые — тоже: иначе
 * счётчик рос бы от собственной активности и от чужих удалений.
 */
export function unreadCount(member: MemberSpec, messages: MessageSpec[]): number {
  if (member.leftAt) return 0;
  return messages.filter(
    (m) =>
      m.deletedAt == null &&
      m.authorId !== member.userId &&
      (member.lastReadAt == null || m.createdAt > member.lastReadAt)
  ).length;
}

/**
 * F-COM-04. Может ли участник отправить сообщение.
 *
 * Режим «только чтение» отключает сообщения рядовых участников, но не
 * модераторов: иначе куратор, закрывший чат группы на время сессии,
 * лишался бы возможности написать в него сам.
 */
export function canPost(
  member: MemberSpec | null,
  conversation: { isReadOnly: boolean; isArchived: boolean }
): { allowed: boolean; reason: string | null } {
  if (!member || member.leftAt) {
    return { allowed: false, reason: 'Вы не участник этого разговора.' };
  }
  if (conversation.isArchived) {
    return { allowed: false, reason: 'Разговор в архиве.' };
  }
  if (conversation.isReadOnly && member.role === 'MEMBER') {
    return { allowed: false, reason: 'Отправка сообщений отключена модератором.' };
  }
  return { allowed: true, reason: null };
}

/** Может ли участник модерировать: закреплять, удалять чужие, закрывать чат */
export function canModerate(member: MemberSpec | null): boolean {
  if (!member || member.leftAt) return false;
  return member.role === 'OWNER' || member.role === 'MODERATOR';
}

/**
 * F-COM-02. Может ли пользователь править или удалить сообщение.
 *
 * Своё сообщение правит и удаляет автор; чужое удаляет модератор, но
 * не правит: правка чужого текста от чужого имени подменяет авторство.
 */
export function messagePermissions(
  member: MemberSpec | null,
  message: { authorId: string | null; deletedAt: Date | null }
): { canEdit: boolean; canDelete: boolean } {
  if (!member || member.leftAt || message.deletedAt) {
    return { canEdit: false, canDelete: false };
  }
  const isOwn = message.authorId != null && message.authorId === member.userId;
  return {
    canEdit: isOwn,
    canDelete: isOwn || canModerate(member),
  };
}

export type AnnouncementScopeCode =
  | 'UNIVERSITY'
  | 'FACULTY'
  | 'DEPARTMENT'
  | 'PROGRAM'
  | 'GROUP'
  | 'COURSE';

export const ANNOUNCEMENT_SCOPE_LABELS: Record<AnnouncementScopeCode, string> = {
  UNIVERSITY: 'весь университет',
  FACULTY: 'факультет',
  DEPARTMENT: 'кафедра',
  PROGRAM: 'образовательная программа',
  GROUP: 'академическая группа',
  COURSE: 'дисциплина',
};

export interface AudienceSpec {
  facultyIds: string[];
  departmentIds: string[];
  programIds: string[];
  groupIds: string[];
  courseIds: string[];
}

export interface TargetSpec {
  scope: AnnouncementScopeCode;
  scopeId: string | null;
}

/**
 * F-COM-05. Попадает ли пользователь в адресацию объявления.
 *
 * Достаточно совпадения по одной цели: объявление, адресованное факультету
 * и отдельной группе, видят и те, и другие.
 */
export function isAddressed(targets: TargetSpec[], audience: AudienceSpec): boolean {
  if (targets.length === 0) return false;
  return targets.some((t) => {
    switch (t.scope) {
      case 'UNIVERSITY':
        return true;
      case 'FACULTY':
        return t.scopeId != null && audience.facultyIds.includes(t.scopeId);
      case 'DEPARTMENT':
        return t.scopeId != null && audience.departmentIds.includes(t.scopeId);
      case 'PROGRAM':
        return t.scopeId != null && audience.programIds.includes(t.scopeId);
      case 'GROUP':
        return t.scopeId != null && audience.groupIds.includes(t.scopeId);
      case 'COURSE':
        return t.scopeId != null && audience.courseIds.includes(t.scopeId);
      default:
        return false;
    }
  });
}

export interface AnnouncementSpec {
  id: string;
  isNormative: boolean;
  isPinned: boolean;
  isImportant: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Опубликовано ли объявление на указанный момент */
export function isVisible(a: AnnouncementSpec, now: Date = new Date()): boolean {
  if (a.publishedAt != null && a.publishedAt > now) return false;
  if (a.expiresAt != null && a.expiresAt < now) return false;
  return true;
}

/**
 * F-COM-07. Порядок объявлений.
 *
 * Нормативное объявление об аккредитации обязано занимать первую позицию
 * и не смещаться вниз (Типовые правила, п. 31) — поэтому сортировка
 * не по дате, а по «нормативное → закреплённое → важное → дата».
 * Обычная сортировка по дате уводила бы его вниз при каждой новости.
 */
export function sortAnnouncements<T extends AnnouncementSpec>(items: T[]): T[] {
  const rank = (a: AnnouncementSpec) =>
    a.isNormative ? 0 : a.isPinned ? 1 : a.isImportant ? 2 : 3;
  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const at = (a.publishedAt ?? a.createdAt).getTime();
    const bt = (b.publishedAt ?? b.createdAt).getTime();
    return bt - at;
  });
}

/**
 * F-COM-08. Ограничение на массовую рассылку.
 *
 * Объявление на весь университет или факультет — это рассылка тысячам
 * человек, и норма ограничивает её уровнем декана и выше. Кафедра, группа
 * и дисциплина такого ограничения не требуют.
 */
export const MASS_SCOPES: AnnouncementScopeCode[] = ['UNIVERSITY', 'FACULTY'];

export function requiresMassPermission(targets: TargetSpec[]): boolean {
  return targets.some((t) => MASS_SCOPES.includes(t.scope));
}
