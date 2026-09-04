import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';

import { routing, type AppLocale } from '@/i18n/routing';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Providers } from '@/components/layout/providers';
import { getCurrentUser } from '@/server/guards';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  const th = await getTranslations({ locale, namespace: 'home' });

  // F-P-06: корректные метатеги Open Graph для распространения ссылок в мессенджерах
  return {
    metadataBase: new URL(process.env.AUTH_URL ?? 'http://localhost:3000'),
    title: { default: t('appName'), template: `%s — ${t('appName')}` },
    description: th('heroSubtitle'),
    openGraph: {
      type: 'website',
      locale: locale === 'kk' ? 'kk_KZ' : locale === 'ru' ? 'ru_RU' : 'en_US',
      title: t('appName'),
      description: th('heroSubtitle'),
      siteName: t('appName'),
    },
    twitter: { card: 'summary_large_image', title: t('appName'), description: th('heroSubtitle') },
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const user = await getCurrentUser();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-fg"
            >
              К основному содержимому
            </a>
            <SiteHeader locale={locale as AppLocale} user={user} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter locale={locale as AppLocale} />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
