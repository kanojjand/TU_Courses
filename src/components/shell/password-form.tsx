'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { changePasswordAction, type FormState } from '@/server/auth-actions';

export function PasswordForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      toast.success(t('passwordChanged'));
      ref.current?.reset();
    }
  }, [state, t]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <Field label={t('currentPassword')}>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('newPassword')} hint={t('passwordTooShort')}>
          <Input name="next" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label={t('repeatPassword')}>
          <Input name="repeat" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </div>
      {state?.error && <p className="text-sm font-medium text-danger">{t(state.error as 'passwordTooShort')}</p>}
      <Button type="submit" disabled={pending}>
        {t('newPassword')}
      </Button>
    </form>
  );
}
