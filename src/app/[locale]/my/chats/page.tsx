import { setRequestLocale } from 'next-intl/server';

import { requireUser } from '@/server/guards';
import { pickLocalized } from '@/i18n/request';
import { listConversations } from '@/server/chat';
import { Link } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { CONVERSATION_KIND_LABELS, type ConversationKindCode } from '@/domain/chat';

export const dynamic = 'force-dynamic';

/** F-COM-01, F-COM-03. Список разговоров со счётчиком непрочитанных. */
export default async function ChatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  const rows = await listConversations(user.id);

  const titleOf = (c: (typeof rows)[number]['membership']['conversation']) => {
    if (c.title) return c.title;
    if (c.group) return `Группа ${c.group.name}`;
    if (c.course) return pickLocalized(c.course.discipline, 'name', locale);
    if (c.department) return c.department.nameRu;
    if (c.faculty) return c.faculty.nameRu;
    return 'Личный диалог';
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Чаты</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Чаты группы и дисциплин создаются автоматически по составу группы и списку
        зарегистрированных.
      </p>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Разговоры ({rows.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Разговоров нет"
                description="Чат группы появится после зачисления в группу, чат дисциплины — после регистрации на неё."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map(({ membership: m, unread }) => {
                const c = m.conversation;
                const last = c.messages[0];
                return (
                  <li key={m.id}>
                    <Link
                      href={`/my/chats/${c.id}`}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{titleOf(c)}</span>
                          <Badge>
                            {CONVERSATION_KIND_LABELS[c.kind as ConversationKindCode] ?? c.kind}
                          </Badge>
                          {c.isReadOnly && <Badge tone="warning">только чтение</Badge>}
                          {m.isMuted && <Badge>без уведомлений</Badge>}
                        </span>
                        {last ? (
                          <span className="mt-0.5 block truncate text-sm text-fg-muted">
                            {last.author
                              ? `${last.author.lastNameRu} ${last.author.firstNameRu[0]}.: `
                              : ''}
                            {last.body}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-sm text-fg-muted">
                            Сообщений пока нет
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {unread > 0 && (
                          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-fg">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                        <span className="text-xs text-fg-muted">
                          {c._count.members} участник
                          {c._count.members % 10 === 1 && c._count.members % 100 !== 11 ? '' : 'ов'}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
