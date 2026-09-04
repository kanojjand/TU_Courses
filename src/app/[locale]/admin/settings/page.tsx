import { setRequestLocale, getTranslations } from 'next-intl/server';

import { requirePageAccess } from '@/server/guards';
import { loadSettings } from '@/server/settings';
import { SettingsForm } from '@/components/admin/settings-form';
import { FontCheck } from '@/components/admin/font-check';

export const dynamic = 'force-dynamic';

/** F-A-08. Настройки: коэффициенты формулы, пороги, академический час, учёт времени. */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'settings:manage');

  const t = await getTranslations('admin');
  const settings = await loadSettings(true);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('settings')}</h1>
      <SettingsForm values={settings} />
      <FontCheck />
    </div>
  );
}
