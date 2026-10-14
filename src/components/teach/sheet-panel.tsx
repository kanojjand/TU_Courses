'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { GradeComponent } from '@/db/schema';
import { confirmSheetAction } from '@/server/teach-actions';

export function ConfirmSheetButton({ offeringId, component, label }: { offeringId: string; component: GradeComponent; label: string }) {
  const t = useTranslations('teach.sheets');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t('confirmQuestion', { component: label }))) return;
        start(async () => {
          const res = await confirmSheetAction(offeringId, component);
          if ('error' in res) toast.error(res.error === 'already' ? t('alreadyConfirmed') : res.error === 'noItems' ? t('noItems') : 'Error');
          else {
            toast.success(t('confirmed'));
            router.refresh();
          }
        })
      }}
    >
      <CheckCircle2 />
      {t('confirm')}
    </Button>
  );
}
