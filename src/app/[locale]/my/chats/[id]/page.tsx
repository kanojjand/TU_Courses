import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { requireUser } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { loadConversation, canModerate, canPost } from '@/server/chat';
import { messagePermissions, CONVERSATION_KIND_LABELS, type ConversationKindCode } from '@/domain/chat';
import { ChatRoom } from '@/components/chat/chat-room';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/** F-COM-01…F-COM-04. Разговор: история, ответы, реакции, модерация. */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, id } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();

  const data = await loadConversation(id, user.id, { search: q?.trim() || undefined });
  if (!data) notFound();

  if (!data.member) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Разговор недоступен"
          description="Вы не состоите в этом разговоре. Чаты группы и дисциплины формируются по составу группы и списку зарегистрированных."
        />
      </div>
    );
  }

  const member = {
    userId: data.member.userId,
    role: data.member.role,
    lastReadAt: data.member.lastReadAt,
    leftAt: data.member.leftAt,
    isMuted: data.member.isMuted,
  };

  const c = data.conversation;
  const title =
    c.title ??
    (c.group
      ? `Группа ${c.group.name}`
      : c.course
        ? pickLocalized(c.course.discipline, 'name', locale)
        : c.department?.nameRu ?? c.faculty?.nameRu ?? 'Личный диалог');

  const posting = canPost(member, c);

  const toView = (m: (typeof data.messages)[number]) => {
    const perms = messagePermissions(member, m);
    const byEmoji = new Map<string, string[]>();
    for (const r of m.reactions) {
      byEmoji.set(r.emoji, [...(byEmoji.get(r.emoji) ?? []), r.userId]);
    }
    return {
      id: m.id,
      body: m.body,
      authorId: m.authorId,
      authorName: m.author
        ? `${m.author.lastNameRu} ${m.author.firstNameRu}`
        : 'Удалённый пользователь',
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      isPinned: m.isPinned,
      isOwn: m.authorId === user.id,
      canEdit: perms.canEdit,
      canDelete: perms.canDelete,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            body: m.replyTo.deletedAt ? 'Сообщение удалено' : m.replyTo.body,
            authorName: m.replyTo.author
              ? `${m.replyTo.author.lastNameRu} ${m.replyTo.author.firstNameRu}`
              : '—',
          }
        : null,
      reactions: [...byEmoji].map(([emoji, userIds]) => ({
        emoji,
        count: userIds.length,
        mine: userIds.includes(user.id),
      })),
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        sizeBytes: a.sizeBytes,
      })),
    };
  };

  return (
    <ChatRoom
      conversationId={c.id}
      title={title}
      kindLabel={CONVERSATION_KIND_LABELS[c.kind as ConversationKindCode] ?? c.kind}
      isReadOnly={c.isReadOnly}
      isMuted={member.isMuted}
      canModerate={canModerate(member)}
      canPost={posting.allowed}
      postBlockedReason={posting.reason}
      search={q ?? ''}
      members={c.members.map((m) => ({
        userId: m.userId,
        name: `${m.user.lastNameRu} ${m.user.firstNameRu}`,
        role: m.role,
      }))}
      pinned={data.pinned.map(toView)}
      messages={data.messages.map(toView)}
    />
  );
}
