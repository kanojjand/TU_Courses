'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { markNotificationsRead } from '@/server/actions/profile';
import { fmtDateTime } from '@/lib/utils';

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** F-S-10. Уведомления о новых материалах, дедлайнах и оценках. */
export function NotificationList({
  items,
  locale,
}: {
  items: NotificationItem[];
  locale: string;
}) {
  const t = useTranslations('common');
  const [list, setList] = useState(items);
  const [pending, startTransition] = useTransition();
  const unread = list.filter((n) => !n.isRead).length;

  function readAll() {
    startTransition(async () => {
      await markNotificationsRead();
      setList((prev) => prev.map((n) => ({ ...n, isRead: true })));
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>
          {t('notifications')}
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-brand-fg">
              {unread}
            </span>
          )}
        </CardTitle>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={readAll} disabled={pending}>
            Прочитано
          </Button>
        )}
      </CardHeader>
      <CardBody>
        {list.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('empty')}</p>
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto text-sm">
            {list.map((n) => {
              const content = (
                <>
                  <p className={n.isRead ? 'text-fg-muted' : 'font-medium'}>{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-fg-muted">{n.body}</p>}
                  <p className="text-xs text-fg-muted">{fmtDateTime(n.createdAt, locale)}</p>
                </>
              );
              return (
                <li key={n.id} className="border-b border-border pb-2 last:border-0">
                  {n.link ? (
                    <Link href={n.link} className="block hover:text-brand">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
