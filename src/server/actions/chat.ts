'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireUser, requirePermission, AccessError } from '@/server/guards';
import { hasRole } from '@/lib/rbac';
import { AUDIT_ACTIONS, writeAudit } from '@/server/audit';
import { canPost, canModerate, messagePermissions, requiresMassPermission } from '@/domain/chat';
import { resolveChannels } from '@/domain/notify';

/**
 * Чаты, объявления и уведомления — F-COM-01…F-COM-08.
 *
 * Живого обновления нет: приложение развёрнуто на Vercel, где нет
 * постоянного соединения. После отправки страница перерисовывается
 * серверным действием.
 */

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

function revalidate() {
  revalidatePath('/[locale]/my/chats', 'page');
  revalidatePath('/[locale]/my/chats/[id]', 'page');
  revalidatePath('/[locale]/admin/announcements', 'page');
}

/** Участие пользователя в разговоре вместе с самим разговором */
async function requireMembership(conversationId: string) {
  const user = await requireUser();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, isReadOnly: true, isArchived: true, kind: true },
  });
  if (!conversation) throw new AccessError('Разговор не найден.', 'NOT_FOUND');

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
  });
  if (!membership || membership.leftAt) {
    throw new AccessError('Вы не участник этого разговора.');
  }

  return {
    user,
    conversation,
    member: {
      userId: membership.userId,
      role: membership.role,
      lastReadAt: membership.lastReadAt,
      leftAt: membership.leftAt,
      isMuted: membership.isMuted,
    },
  };
}

// ── Сообщения (F-COM-02) ────────────────────────────────────────────────────

const sendSchema = z.object({
  conversationId: z.string().trim().min(1),
  body: z.string().trim().min(1, 'Сообщение не может быть пустым.').max(4000),
  replyToId: z.string().trim().optional(),
});

export async function sendMessage(input: z.input<typeof sendSchema>): Promise<Result<{ id: string }>> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте сообщение.');
  const { conversationId, body, replyToId } = parsed.data;

  const { user, conversation, member } = await requireMembership(conversationId);
  const check = canPost(member, conversation);
  if (!check.allowed) return fail(check.reason ?? 'Отправка недоступна.');

  // Ответ должен относиться к тому же разговору: иначе цитата уводит
  // в чужую переписку
  if (replyToId) {
    const target = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { conversationId: true },
    });
    if (!target || target.conversationId !== conversationId) {
      return fail('Сообщение, на которое вы отвечаете, относится к другому разговору.');
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, authorId: user.id, body, replyToId: replyToId || null },
      select: { id: true, createdAt: true },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: created.createdAt },
    });
    // Отправитель считается прочитавшим собственное сообщение
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: created.createdAt },
    });
    return created;
  });

  await notifyConversation(conversationId, user.id, body);

  revalidate();
  return { ok: true, data: { id: message.id } };
}

/**
 * Уведомления участникам о новом сообщении.
 *
 * Отключившие звук участники уведомление не получают; настройка канала
 * учитывается через resolveChannels. Сообщения в чатах критическими
 * не считаются — их отключить можно.
 */
async function notifyConversation(conversationId: string, authorId: string, body: string) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId, leftAt: null, isMuted: false, userId: { not: authorId } },
    select: { userId: true, user: { select: { notifyPrefs: true } } },
  });
  if (members.length === 0) return;

  const recipients = members.filter((m) =>
    resolveChannels(
      'CHAT_MESSAGE',
      m.user.notifyPrefs.map((p) => ({ type: p.type, channel: p.channel, enabled: p.enabled })),
      ['IN_APP']
    ).includes('IN_APP')
  );
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((m) => ({
      userId: m.userId,
      type: 'CHAT_MESSAGE' as const,
      title: 'Новое сообщение',
      body: body.slice(0, 200),
      link: `/my/chats/${conversationId}`,
    })),
  });
}

const editSchema = z.object({
  messageId: z.string().trim().min(1),
  body: z.string().trim().min(1, 'Сообщение не может быть пустым.').max(4000),
});

export async function editMessage(input: z.input<typeof editSchema>): Promise<Result> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте сообщение.');
  const { messageId, body } = parsed.data;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, authorId: true, deletedAt: true },
  });
  if (!message) return fail('Сообщение не найдено.');

  const { member } = await requireMembership(message.conversationId);
  const perms = messagePermissions(member, message);
  if (!perms.canEdit) return fail('Править можно только собственные сообщения.');

  // Правка сохраняется с пометкой: собеседник должен видеть, что текст менялся
  await prisma.message.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
  });

  revalidate();
  return { ok: true };
}

export async function deleteMessage(messageId: string): Promise<Result> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, authorId: true, deletedAt: true, body: true },
  });
  if (!message) return fail('Сообщение не найдено.');

  const { user, member } = await requireMembership(message.conversationId);
  const perms = messagePermissions(member, message);
  if (!perms.canDelete) return fail('Недостаточно прав для удаления сообщения.');

  // Запись остаётся в истории с пометкой «удалено»: F-COM-04 требует
  // фиксации действия модератора, а стирание строки её уничтожает
  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), deletedById: user.id, isPinned: false },
  });

  const isModeration = message.authorId !== user.id;
  if (isModeration) {
    await writeAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.MESSAGE_MODERATE,
      entityType: 'Message',
      entityId: messageId,
      oldValue: { body: message.body.slice(0, 500), authorId: message.authorId },
    });
  }

  revalidate();
  return { ok: true };
}

export async function toggleReaction(messageId: string, emoji: string): Promise<Result> {
  if (!emoji || emoji.length > 8) return fail('Некорректная реакция.');

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return fail('Сообщение недоступно.');

  const { user } = await requireMembership(message.conversationId);
  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
    select: { id: true },
  });

  if (existing) await prisma.messageReaction.delete({ where: { id: existing.id } });
  else await prisma.messageReaction.create({ data: { messageId, userId: user.id, emoji } });

  revalidate();
  return { ok: true };
}

// ── Модерация (F-COM-04) ────────────────────────────────────────────────────

export async function togglePin(messageId: string): Promise<Result> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, isPinned: true, deletedAt: true },
  });
  if (!message || message.deletedAt) return fail('Сообщение недоступно.');

  const { member } = await requireMembership(message.conversationId);
  if (!canModerate(member)) return fail('Закреплять сообщения может модератор разговора.');

  await prisma.message.update({
    where: { id: messageId },
    data: { isPinned: !message.isPinned },
  });

  revalidate();
  return { ok: true };
}

export async function setReadOnly(conversationId: string, isReadOnly: boolean): Promise<Result> {
  const { user, member } = await requireMembership(conversationId);
  if (!canModerate(member)) return fail('Изменять режим разговора может модератор.');

  await prisma.conversation.update({ where: { id: conversationId }, data: { isReadOnly } });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.CONVERSATION_MODERATE,
    entityType: 'Conversation',
    entityId: conversationId,
    newValue: { isReadOnly },
  });

  revalidate();
  return { ok: true };
}

/** F-COM-03. Отметка прочтения — сдвигает счётчик непрочитанных */
export async function markRead(conversationId: string): Promise<Result> {
  const { user } = await requireMembership(conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  revalidate();
  return { ok: true };
}

export async function toggleMute(conversationId: string): Promise<Result> {
  const { user, member } = await requireMembership(conversationId);
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { isMuted: !member.isMuted },
  });
  revalidate();
  return { ok: true };
}

// ── Личный диалог (F-COM-01) ────────────────────────────────────────────────

/**
 * Открытие личного диалога.
 *
 * Диалог между теми же двумя участниками не создаётся повторно: иначе
 * переписка расползалась бы по нескольким веткам.
 */
export async function openDirect(otherUserId: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (otherUserId === user.id) return fail('Нельзя открыть диалог с самим собой.');

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, status: true },
  });
  if (!other || other.status !== 'ACTIVE') return fail('Собеседник недоступен.');

  const existing = await prisma.conversation.findFirst({
    where: {
      kind: 'DIRECT',
      AND: [
        { members: { some: { userId: user.id, leftAt: null } } },
        { members: { some: { userId: otherUserId, leftAt: null } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return { ok: true, data: { id: existing.id } };

  const created = await prisma.conversation.create({
    data: {
      kind: 'DIRECT',
      createdById: user.id,
      members: {
        create: [
          { userId: user.id, role: 'MEMBER' },
          { userId: otherUserId, role: 'MEMBER' },
        ],
      },
    },
    select: { id: true },
  });

  revalidate();
  return { ok: true, data: { id: created.id } };
}

// ── Объявления (F-COM-05, F-COM-07, F-COM-08) ──────────────────────────────

const announcementSchema = z.object({
  id: z.string().trim().optional(),
  title: z.string().trim().min(1, 'Укажите заголовок.').max(300),
  body: z.string().trim().min(1, 'Введите текст объявления.').max(10000),
  isImportant: z.coerce.boolean().default(false),
  isPinned: z.coerce.boolean().default(false),
  isNormative: z.coerce.boolean().default(false),
  publishedAt: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
  targets: z
    .array(
      z.object({
        scope: z.enum(['UNIVERSITY', 'FACULTY', 'DEPARTMENT', 'PROGRAM', 'GROUP', 'COURSE']),
        scopeId: z.string().trim().optional(),
      })
    )
    .min(1, 'Укажите, кому адресовано объявление.')
    .max(50),
});

export type SaveAnnouncementInput = z.input<typeof announcementSchema>;

/**
 * F-COM-05, F-COM-08. Публикация адресного объявления.
 *
 * Рассылка на весь университет или факультет требует отдельного права
 * и журналируется: это сообщение тысячам человек.
 */
export async function saveAnnouncement(
  input: SaveAnnouncementInput
): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
  const { id, targets, publishedAt, expiresAt, isNormative, ...rest } = parsed.data;

  const mass = requiresMassPermission(
    targets.map((t) => ({ scope: t.scope, scopeId: t.scopeId ?? null }))
  );
  if (mass && !hasRole(user, 'ADMIN', 'REGISTRAR')) {
    return fail(
      'Рассылка на весь университет или факультет доступна деканату и администратору. ' +
        'Выберите кафедру, программу, группу или дисциплину.'
    );
  }
  if (isNormative && !hasRole(user, 'ADMIN')) {
    return fail('Закреплённое нормативное объявление публикует администратор платформы.');
  }

  const data = {
    ...rest,
    isNormative,
    authorId: user.id,
    publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const a = id
      ? await tx.announcement.update({ where: { id }, data, select: { id: true } })
      : await tx.announcement.create({ data, select: { id: true } });

    await tx.announcementTarget.deleteMany({ where: { announcementId: a.id } });
    await tx.announcementTarget.createMany({
      data: targets.map((t) => ({
        announcementId: a.id,
        scope: t.scope,
        scopeId: t.scope === 'UNIVERSITY' ? null : (t.scopeId || null),
      })),
      skipDuplicates: true,
    });
    return a;
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: mass ? AUDIT_ACTIONS.ANNOUNCEMENT_MASS : AUDIT_ACTIONS.ANNOUNCEMENT_PUBLISH,
    entityType: 'Announcement',
    entityId: saved.id,
    newValue: { title: rest.title, targets, isNormative, isImportant: rest.isImportant },
  });

  revalidate();
  return { ok: true, data: { id: saved.id } };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const user = await requirePermission('settings:manage');
  await prisma.announcement.delete({ where: { id } });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.ANNOUNCEMENT_DELETE,
    entityType: 'Announcement',
    entityId: id,
  });
  revalidate();
  return { ok: true };
}

/** F-COM-05. Подтверждение прочтения важного объявления */
export async function acknowledgeAnnouncement(announcementId: string): Promise<Result> {
  const user = await requireUser();
  await prisma.announcementAck.upsert({
    where: { announcementId_userId: { announcementId, userId: user.id } },
    create: { announcementId, userId: user.id },
    update: {},
  });
  revalidate();
  return { ok: true };
}

// ── Настройки уведомлений (F-COM-06) ────────────────────────────────────────

const prefSchema = z.object({
  type: z.enum([
    'NEW_MATERIAL',
    'DEADLINE_SOON',
    'GRADE_POSTED',
    'ANNOUNCEMENT',
    'SUBMISSION_RETURNED',
    'COURSE_REVIEW',
    'SYSTEM',
    'CHAT_MESSAGE',
    'IEP_STATUS',
    'APPEAL_STATUS',
    'ORDER_ISSUED',
  ]),
  channel: z.enum(['IN_APP', 'EMAIL', 'PUSH']),
  enabled: z.coerce.boolean(),
});

/**
 * Настройка канала доставки.
 *
 * Попытка отключить критическое уведомление в приложении отклоняется
 * на сервере: интерфейс блокирует переключатель, но действие вызывается
 * и напрямую.
 */
export async function setNotificationPreference(
  input: z.input<typeof prefSchema>
): Promise<Result> {
  const user = await requireUser();
  const parsed = prefSchema.safeParse(input);
  if (!parsed.success) return fail('Некорректная настройка.');
  const { type, channel, enabled } = parsed.data;

  const { canDisable } = await import('@/domain/notify');
  if (!enabled && !canDisable(type, channel)) {
    return fail(
      'Это уведомление критическое: о дедлайне, оценке и приказе вы должны узнать. ' +
        'Отключить его в приложении нельзя.'
    );
  }

  await prisma.notificationPreference.upsert({
    where: { userId_type_channel: { userId: user.id, type, channel } },
    create: { userId: user.id, type, channel, enabled },
    update: { enabled },
  });

  revalidatePath('/[locale]/my/profile', 'page');
  return { ok: true };
}
