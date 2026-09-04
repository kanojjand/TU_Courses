'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';

import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { changePassword } from '@/server/actions/profile';

export function PasswordForm({
  requireCurrent,
  redirectTo,
}: {
  requireCurrent: boolean;
  redirectTo?: string;
}) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const { update } = useSession();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await changePassword({
        current: requireCurrent ? String(formData.get('current') ?? '') : undefined,
        next: String(formData.get('next') ?? ''),
        repeat: String(formData.get('repeat') ?? ''),
      });

      if (!result.ok) {
        setError(result.error ?? tc('error'));
        return;
      }

      setDone(true);
      await update();
      if (redirectTo) window.location.href = redirectTo;
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">{tc('saved')}</Alert>}

      {requireCurrent && (
        <Field label={t('password')} required>
          <Input name="current" type="password" autoComplete="current-password" required />
        </Field>
      )}

      <Field label={t('newPassword')} hint={t('passwordTooShort')} required>
        <Input name="next" type="password" autoComplete="new-password" minLength={10} required />
      </Field>

      <Field label={t('repeatPassword')} required>
        <Input name="repeat" type="password" autoComplete="new-password" minLength={10} required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? '…' : tc('save')}
      </Button>
    </form>
  );
}
