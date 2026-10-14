import '@fontsource-variable/inter';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: { default: 'TU Online', template: '%s · TU Online' },
  description: 'TU Online — онлайн-обучение Университета Ташенева',
  applicationName: 'TU Online',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e70426',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const a11y = (await cookies()).get('tu_a11y')?.value === '1';
  return (
    <html lang={locale} className={a11y ? 'a11y' : undefined} suppressHydrationWarning>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
