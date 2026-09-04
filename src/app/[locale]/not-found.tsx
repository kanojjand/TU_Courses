import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl font-bold text-fg-muted">404</p>
      <h1 className="mt-4 text-xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t('notFoundText')}</p>
      <Link href="/" className="mt-6 inline-block">
        <Button variant="outline">{t('backHome')}</Button>
      </Link>
    </div>
  );
}
