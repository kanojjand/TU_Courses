'use client';

import { useTransition } from 'react';
import { useParams } from 'next/navigation';
import { usePathname, useRouter, LOCALE_NAMES, routing, type AppLocale } from '@/i18n/routing';

/** F-L-02: переключение языка интерфейса, сохраняется в cookie и профиле */
export function LocaleSwitcher({ current }: { current: AppLocale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(() => {
      router.replace(
        // @ts-expect-error — динамические сегменты передаются как есть
        { pathname, params },
        { locale: next as AppLocale }
      );
      // Сохранение выбора в профиле пользователя (если он авторизован)
      void fetch('/api/profile/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      }).catch(() => {});
    });
  }

  return (
    <label className="relative">
      <span className="sr-only">Язык интерфейса</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-sm text-fg"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
