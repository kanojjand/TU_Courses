'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { decideRequestAction } from '@/server/registrar-actions';

export function RequestActions({ id }: { id: string }) {
  const t = useTranslations('registrar.requests');
  const router = useRouter();
  const [pending, start] = useTransition();
  const decide = (approve: boolean) => {
    const comment = window.prompt(t('commentPrompt')) ?? undefined;
    start(async () => {
      const res = await decideRequestAction(id, approve, comment || undefined);
      if ('error' in res) toast.error('Error');
      else {
        toast.success(t('decidedOk'));
        router.refresh();
      }
    });
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="success" onClick={() => decide(true)} disabled={pending}>
        <Check />
        {t('approve')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => decide(false)} disabled={pending}>
        <X />
        {t('reject')}
      </Button>
    </div>
  );
}
