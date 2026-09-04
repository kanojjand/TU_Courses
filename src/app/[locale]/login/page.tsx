import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { auth } from '@/auth';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardBody } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { homeRouteFor } from '@/lib/rbac';
import type { RoleCode } from '@/lib/rbac';

/** F-S-01. Вход по логину и паролю. Саморегистрация на этапе 1 отключена. */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { callbackUrl, error } = await searchParams;

  const session = await auth();
  if (session?.user) {
    redirect(`/${locale}${homeRouteFor({ roles: session.user.roles as RoleCode[] })}`);
  }

  const t = await getTranslations('auth');

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-bold">{t('signInTitle')}</h1>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error === 'AccessDenied' ? t('accountLocked') : t('invalidCredentials')}
        </Alert>
      )}

      <Card className="mt-6">
        <CardBody>
          <LoginForm callbackUrl={callbackUrl ?? `/${locale}/dashboard`} />
        </CardBody>
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-fg-muted">{t('noSelfRegistration')}</p>
    </div>
  );
}
