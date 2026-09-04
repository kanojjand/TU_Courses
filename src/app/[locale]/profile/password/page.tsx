import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/server/guards';
import { Card, CardBody } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { PasswordForm } from '@/components/auth/password-form';

export const dynamic = 'force-dynamic';

/** Принудительная смена временного пароля после импорта учётной записи. */
export default async function ForcePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations('auth');

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">{t('changePasswordTitle')}</h1>
      {user.mustChangePassword && (
        <Alert tone="warning" className="mt-4">
          {t('changePasswordHint')}
        </Alert>
      )}
      <Card className="mt-6">
        <CardBody>
          <PasswordForm requireCurrent={!user.mustChangePassword} redirectTo={`/${locale}/dashboard`} />
        </CardBody>
      </Card>
    </div>
  );
}
