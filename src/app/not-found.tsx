import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { buttonClass } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold text-brand">404</p>
      <h1 className="text-xl font-semibold">{t('notFound')}</h1>
      <Link href="/" className={buttonClass('primary')}>
        {t('toHome')}
      </Link>
    </main>
  );
}
