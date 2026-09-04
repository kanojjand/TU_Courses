import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * F-L-01, F-L-02: интерфейс на трёх языках, префикс локали в URL.
 * Казахский — язык по умолчанию.
 */
export const routing = defineRouting({
  locales: ['kk', 'ru', 'en'],
  defaultLocale: 'kk',
  localePrefix: 'always',
  localeCookie: { name: 'LMS_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});

export type AppLocale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

export const LOCALE_NAMES: Record<AppLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

/** Локаль приложения ↔ перечисление LanguageCode в БД */
export function localeToDb(locale: AppLocale): 'KK' | 'RU' | 'EN' {
  return locale.toUpperCase() as 'KK' | 'RU' | 'EN';
}

export function dbToLocale(code: string): AppLocale {
  const lower = code.toLowerCase();
  return (routing.locales as readonly string[]).includes(lower)
    ? (lower as AppLocale)
    : routing.defaultLocale;
}
