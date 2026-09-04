import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations('nav');
  const tc = await getTranslations('common');

  return (
    <footer className="no-print border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-semibold">{tc('appName')}</p>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            Компонент информационной системы управления образованием вуза
            (п. 61 Типовых правил деятельности ОВПО).
          </p>
        </div>
        <nav aria-label="Разделы">
          <ul className="space-y-2 text-fg-muted">
            <li><Link className="hover:text-fg" href="/courses">{t('catalog')}</Link></li>
            <li><Link className="hover:text-fg" href="/about">{t('about')}</Link></li>
          </ul>
        </nav>
        <nav aria-label="Документы">
          <ul className="space-y-2 text-fg-muted">
            <li><Link className="hover:text-fg" href="/rules">{t('rules')}</Link></li>
            <li><Link className="hover:text-fg" href="/privacy">{t('privacy')}</Link></li>
          </ul>
        </nav>
        <nav aria-label="Поддержка">
          <ul className="space-y-2 text-fg-muted">
            <li><Link className="hover:text-fg" href="/support">{t('support')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-fg-muted">
        © {new Date().getFullYear()} · {locale.toUpperCase()}
      </div>
    </footer>
  );
}
