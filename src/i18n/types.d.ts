import type { Messages } from './messages';
import type { AppLocale } from './config';

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
