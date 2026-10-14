import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, LOCALE_COOKIE, type AppLocale } from './config';
import { buildMessages } from './messages';

/**
 * Язык интерфейса без префикса в адресе: из cookie (ставится переключателем
 * в шапке и при входе по настройке пользователя), иначе из языка браузера.
 */
export async function resolveLocale(): Promise<AppLocale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const code = part.trim().slice(0, 2).toLowerCase();
    if (code === 'kk' || code === 'kz') return 'kk';
    if (isLocale(code)) return code;
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: buildMessages(locale),
    timeZone: 'Asia/Almaty',
    now: new Date(),
  };
});
