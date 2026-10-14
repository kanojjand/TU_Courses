import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { A11yToggle } from '@/components/shell/a11y-toggle';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { LoginForm } from '@/components/shell/login-form';
import { Logo } from '@/components/shell/logo';
import { getCurrentUser } from '@/lib/auth';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, isDemoMode } from '@/lib/demo';

export const metadata: Metadata = { title: 'Вход' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect('/');
  const { next } = await searchParams;
  const t = await getTranslations();
  const demo = isDemoMode() ? DEMO_ACCOUNTS.map((d) => ({ login: d.login, role: t(`roles.${d.role}`) })) : undefined;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <A11yToggle />
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-12 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight">{t('auth.title')}</h1>
            <p className="mt-1 text-fg-muted">{t('auth.subtitle')}</p>
          </div>
          <div data-card className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <LoginForm next={next} demo={demo} demoPassword={demo ? DEMO_PASSWORD : undefined} />
          </div>
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-fg-muted">© {new Date().getFullYear()} {t('common.university')}</footer>
    </div>
  );
}
