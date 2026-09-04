'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAccess = error.message.includes('Недостаточно прав') || error.message.includes('не зарегистрированы');

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">
        {isAccess ? t('forbiddenTitle') : t('serverTitle')}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {isAccess ? t('forbiddenText') : t('serverText')}
      </p>
      {error.digest && <p className="mt-2 text-xs text-fg-muted">ID: {error.digest}</p>}
      <Button variant="outline" className="mt-6" onClick={reset}>
        Повторить
      </Button>
    </div>
  );
}
