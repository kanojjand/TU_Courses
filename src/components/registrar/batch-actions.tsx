'use client';

import { Check, CheckCheck, Send, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BatchStatus } from '@/db/schema';
import { markReadySentAction, setBatchStatusAction } from '@/server/registrar-actions';

export function BatchActions({ id, status }: { id: string; status: BatchStatus }) {
  const t = useTranslations('registrar.sheets');
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (s: 'sent' | 'confirmed' | 'rejected', comment?: string) =>
    start(async () => {
      await setBatchStatusAction(id, s, comment);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {status === 'ready' && (
        <Button size="sm" onClick={() => run('sent')} disabled={pending}>
          <Send />
          {t('markSent')}
        </Button>
      )}
      {status === 'sent' && (
        <Button size="sm" variant="success" onClick={() => run('confirmed')} disabled={pending}>
          <Check />
          {t('markConfirmed')}
        </Button>
      )}
      {(status === 'ready' || status === 'sent') && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const c = window.prompt(t('rejectReason'));
            if (c) run('rejected', c);
          }}
        >
          <Undo2 />
          {t('reject')}
        </Button>
      )}
    </div>
  );
}

export function MarkAllSent({ count }: { count: number }) {
  const t = useTranslations('registrar.sheets');
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!count) return null;
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await markReadySentAction();
          toast.success(`${t('markSent')}: ${r.count}`);
          router.refresh();
        })
      }
    >
      <CheckCheck />
      {t('markSent')} ({count})
    </Button>
  );
}
