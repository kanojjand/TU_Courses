'use client';

import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { loginAction, type FormState } from '@/server/auth-actions';

export type DemoAccount = { login: string; role: string };

export function LoginForm({ next, demo, demoPassword }: { next?: string; demo?: DemoAccount[]; demoPassword?: string }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function fill(login: string) {
    const f = formRef.current;
    if (!f || !demoPassword) return;
    (f.elements.namedItem('login') as HTMLInputElement).value = login;
    (f.elements.namedItem('password') as HTMLInputElement).value = demoPassword;
    f.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label={t('login')} htmlFor="login">
          <Input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
        </Field>
        <Field label={t('password')} htmlFor="password">
          <div className="relative">
            <Input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="pr-12" />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={t('showPassword')}
              className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center text-fg-muted hover:text-fg"
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {t(state.error === 'locked' ? 'locked' : state.error === 'blocked' ? 'blocked' : 'invalid')}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <LogIn />
          {t('submit')}
        </Button>
        <p className="text-center text-sm text-fg-muted">{t('forgot')}</p>
      </form>
      {demo && demo.length > 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-semibold">{t('demoTitle')}</p>
          <p className="mb-3 text-xs text-fg-muted">{t('demoHint', { password: demoPassword ?? '' })}</p>
          <div className="flex flex-wrap gap-2">
            {demo.map((d) => (
              <button
                key={d.login}
                type="button"
                onClick={() => fill(d.login)}
                disabled={pending}
                className="min-h-9 rounded-full border border-border bg-surface px-3 text-xs font-medium hover:border-brand hover:text-brand"
              >
                {d.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
