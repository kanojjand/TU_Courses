'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { refreshMediaStatuses } from '@/server/video-actions';

export function RefreshVideosButton() {
  const t = useTranslations('studio.videos');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(async () => (await refreshMediaStatuses(), router.refresh()))}>
      <RefreshCw className={pending ? 'animate-spin' : undefined} />
      {t('refresh')}
    </Button>
  );
}
