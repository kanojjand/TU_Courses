import { desc, eq } from 'drizzle-orm';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { MarkRead } from '@/components/shell/mark-read';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

export default async function NotificationsPage() {
  const user = await requireUser();
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const list = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(200);
  const unread = list.filter((n) => !n.readAt).length;
  const text = (type: string, params: Record<string, string | number>) => {
    try {
      return t(`notify.types.${type as 'gradePosted'}`, { item: '', course: '', component: '', file: '', date: '', score: '', ...params });
    } catch {
      return type;
    }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <MarkRead unread={unread} />
      <PageHeader title={t('notify.title')} />
      {list.length === 0 ? (
        <EmptyState icon={<Bell />} title={t('notify.empty')} />
      ) : (
        <ul data-card className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {list.map((n) => {
            const body = (
              <div className={cn('flex gap-3 p-4', !n.readAt && 'bg-brand-soft/60')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} />
                <div className="min-w-0 flex-1">
                  <p className={cn(!n.readAt && 'font-medium')}>{text(n.type, n.params)}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{format.relativeTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-2/60">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
