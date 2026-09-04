import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

function isSupported(value: string | undefined): value is (typeof routing.locales)[number] {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isSupported(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: 'Asia/Almaty',
    formats: {
      dateTime: {
        short: { day: '2-digit', month: '2-digit', year: 'numeric' },
        long: { day: 'numeric', month: 'long', year: 'numeric' },
        withTime: {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      },
      number: {
        score: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
        gpa: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      },
    },
  };
});

/**
 * Выбор языкового варианта наименования справочника (F-L-03).
 * Порядок отката: запрошенный язык → русский → казахский → английский.
 */
export function pickLocalized(
  entity: Record<string, unknown>,
  field: string,
  locale: string
): string {
  const suffix = locale.charAt(0).toUpperCase() + locale.slice(1, 2).toLowerCase();
  const order = [suffix, 'Ru', 'Kk', 'En'];
  for (const s of order) {
    const value = entity[`${field}${s}`];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const plain = entity[field];
  return typeof plain === 'string' ? plain : '';
}
