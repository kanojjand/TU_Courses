export const locales = ['kk', 'ru', 'en'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'ru';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const localeLabels: Record<AppLocale, { short: string; full: string }> = {
  kk: { short: 'ҚАЗ', full: 'Қазақша' },
  ru: { short: 'РУС', full: 'Русский' },
  en: { short: 'ENG', full: 'English' },
};

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === 'string' && (locales as readonly string[]).includes(v);
}

/** Название из трёх колонок (name_kk / name_ru / name_en) на языке интерфейса */
export function pickName(
  row: { nameKk?: string | null; nameRu?: string | null; nameEn?: string | null } | null | undefined,
  locale: string,
): string {
  if (!row) return '';
  const byLocale = locale === 'kk' ? row.nameKk : locale === 'en' ? row.nameEn : row.nameRu;
  return byLocale || row.nameRu || row.nameKk || row.nameEn || '';
}
