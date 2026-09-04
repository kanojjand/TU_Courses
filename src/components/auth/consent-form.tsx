'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { acceptConsent } from '@/server/actions/profile';

export function ConsentForm({ locale, version }: { locale: string; version: string }) {
  const t = useTranslations('consent');
  const [pending, setPending] = useState(false);
  const { update } = useSession();

  async function accept() {
    setPending(true);
    await acceptConsent(version);
    // Обновление токена сессии, чтобы middleware перестал перенаправлять на /consent
    await update();
    window.location.href = `/${locale}/dashboard`;
  }

  return (
    <Button onClick={accept} disabled={pending}>
      {pending ? '…' : t('accept')}
    </Button>
  );
}
