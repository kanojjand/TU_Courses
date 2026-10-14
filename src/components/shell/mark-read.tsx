'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markNotificationsRead } from '@/server/common-actions';

/** Отмечает уведомления прочитанными, когда человек реально открыл страницу */
export function MarkRead({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(() => markNotificationsRead().then(() => router.refresh()), 1500);
    return () => clearTimeout(id);
  }, [unread, router]);
  return null;
}
