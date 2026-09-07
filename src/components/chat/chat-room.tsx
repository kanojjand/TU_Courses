'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { BellOff, Check, Lock, Pin, Search, Send, Users, X } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  togglePin,
  setReadOnly,
  markRead,
  toggleMute,
} from '@/server/actions/chat';

export interface MessageView {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isPinned: boolean;
  isOwn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  replyTo: { id: string; body: string; authorName: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
  attachments: { id: string; fileName: string; sizeBytes: number }[];
}

const QUICK_REACTIONS = ['👍', '✅', '❓', '❤️'];

/**
 * F-COM-01…F-COM-04. Разговор.
 *
 * Живого обновления нет: приложение развёрнуто на Vercel, где нет постоянного
 * соединения. После отправки страница перерисовывается серверным действием;
 * подключение сокет-сервера потребует правки только этого компонента.
 */
export function ChatRoom({
  conversationId,
  title,
  kindLabel,
  isReadOnly,
  isMuted,
  canModerate,
  canPost,
  postBlockedReason,
  search,
  members,
  pinned,
  messages,
}: {
  conversationId: string;
  title: string;
  kindLabel: string;
  isReadOnly: boolean;
  isMuted: boolean;
  canModerate: boolean;
  canPost: boolean;
  postBlockedReason: string | null;
  search: string;
  members: { userId: string; name: string; role: string }[];
  pinned: MessageView[];
  messages: MessageView[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Отметка прочтения ставится при открытии разговора, а не при отправке:
  // читают чаще, чем пишут
  useEffect(() => {
    void markRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReplyTo(null);
      setEditing(null);
      formRef.current?.reset();
      router.refresh();
    });
  }

  function submit(fd: FormData) {
    const body = String(fd.get('body') ?? '').trim();
    if (!body) return;
    if (editing) run(() => editMessage({ messageId: editing.id, body }));
    else
      run(() =>
        sendMessage({ conversationId, body, replyToId: replyTo?.id ?? undefined })
      );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge>{kindLabel}</Badge>
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              className="inline-flex items-center gap-1 rounded px-1 hover:text-brand"
            >
              <Users size={14} aria-hidden /> {members.length}
            </button>
            {isReadOnly && (
              <Badge tone="warning">
                <Lock size={11} className="mr-1" aria-hidden />
                только чтение
              </Badge>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => toggleMute(conversationId))}
          >
            <BellOff size={14} aria-hidden /> {isMuted ? 'Включить' : 'Отключить'} уведомления
          </Button>
          {canModerate && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => setReadOnly(conversationId, !isReadOnly))}
            >
              <Lock size={14} aria-hidden />
              {isReadOnly ? 'Разрешить сообщения' : 'Отключить сообщения'}
            </Button>
          )}
        </div>
      </div>

      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

      {showMembers && (
        <Card className="mb-3">
          <CardBody className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <Badge key={m.userId} tone={m.role === 'MEMBER' ? 'neutral' : 'brand'}>
                {m.name}
                {m.role !== 'MEMBER' && ' · модератор'}
              </Badge>
            ))}
          </CardBody>
        </Card>
      )}

      {/* F-COM-03: поиск по истории разговора */}
      <form method="get" className="mb-3 flex gap-2">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Поиск по сообщениям"
          aria-label="Поиск по сообщениям"
        />
        <Button type="submit" variant="outline" size="sm">
          <Search size={14} aria-hidden />
        </Button>
        {search && (
          <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/my/chats/${conversationId}`)}>
            Сбросить
          </Button>
        )}
      </form>

      {pinned.length > 0 && !search && (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Pin size={14} className="text-brand" aria-hidden />
              Закреплённые
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {pinned.map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.authorName}: </span>
                  {m.body}
                </span>
                {canModerate && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => togglePin(m.id))}
                    className="shrink-0 rounded px-1 text-fg-muted hover:text-danger"
                    aria-label="Открепить"
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="max-h-[60vh] space-y-3 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState
              title={search ? 'Ничего не найдено' : 'Сообщений пока нет'}
              description={search ? 'Попробуйте другой запрос.' : 'Напишите первым.'}
            />
          ) : (
            messages.map((m) => (
              <article
                key={m.id}
                className={`rounded-lg border px-3 py-2 ${
                  m.isOwn ? 'border-brand/30 bg-brand-soft/50' : 'border-border'
                } ${m.deletedAt ? 'opacity-60' : ''}`}
              >
                <div className="mb-1 flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-medium text-fg">{m.authorName}</span>
                  <span className="text-fg-muted">
                    {new Date(m.createdAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {m.editedAt && <span className="text-fg-muted">· изменено</span>}
                  {m.isPinned && <Pin size={11} className="text-brand" aria-hidden />}
                </div>

                {m.replyTo && (
                  <div className="mb-1.5 border-l-2 border-brand/40 pl-2 text-xs text-fg-muted">
                    <span className="font-medium">{m.replyTo.authorName}: </span>
                    {m.replyTo.body.slice(0, 120)}
                  </div>
                )}

                <p className="whitespace-pre-wrap text-sm">
                  {m.deletedAt ? <em className="text-fg-muted">Сообщение удалено</em> : m.body}
                </p>

                {!m.deletedAt && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => toggleReaction(m.id, r.emoji))}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          r.mine ? 'border-brand bg-brand-soft' : 'border-border'
                        }`}
                      >
                        {r.emoji} {r.count}
                      </button>
                    ))}
                    <span className="ml-1 flex gap-0.5">
                      {QUICK_REACTIONS.filter((e) => !m.reactions.some((r) => r.emoji === e)).map(
                        (e) => (
                          <button
                            key={e}
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => toggleReaction(m.id, e))}
                            className="rounded px-1 text-xs opacity-40 transition-opacity hover:opacity-100"
                            aria-label={`Реакция ${e}`}
                          >
                            {e}
                          </button>
                        )
                      )}
                    </span>

                    <span className="ml-auto flex gap-1 text-xs">
                      {canPost && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setReplyTo(m);
                          }}
                          className="rounded px-1.5 text-fg-muted hover:text-brand"
                        >
                          Ответить
                        </button>
                      )}
                      {m.canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo(null);
                            setEditing(m);
                          }}
                          className="rounded px-1.5 text-fg-muted hover:text-brand"
                        >
                          Править
                        </button>
                      )}
                      {canModerate && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => togglePin(m.id))}
                          className="rounded px-1.5 text-fg-muted hover:text-brand"
                        >
                          {m.isPinned ? 'Открепить' : 'Закрепить'}
                        </button>
                      )}
                      {m.canDelete && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteMessage(m.id))}
                          className="rounded px-1.5 text-fg-muted hover:text-danger"
                        >
                          Удалить
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </article>
            ))
          )}
          <div ref={bottomRef} />
        </CardBody>

        <div className="border-t border-border p-3">
          {!canPost ? (
            <p className="text-sm text-fg-muted">{postBlockedReason}</p>
          ) : (
            <form ref={formRef} action={submit} className="space-y-2">
              {(replyTo || editing) && (
                <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {editing ? 'Правка сообщения' : `Ответ ${replyTo!.authorName}`}:{' '}
                    </span>
                    {(editing ?? replyTo)!.body.slice(0, 120)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                      setEditing(null);
                    }}
                    className="shrink-0 text-fg-muted hover:text-danger"
                    aria-label="Отменить"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  name="body"
                  rows={2}
                  required
                  maxLength={4000}
                  defaultValue={editing?.body ?? ''}
                  placeholder="Сообщение"
                  aria-label="Текст сообщения"
                />
                <Button type="submit" disabled={pending} className="self-end">
                  {editing ? <Check size={16} aria-hidden /> : <Send size={16} aria-hidden />}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
