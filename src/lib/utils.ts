import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Форматирование балла: 78 → «78», 78.5 → «78,5» */
export function fmtScore(value: number | null | undefined, locale = 'ru'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/** GPA всегда с двумя знаками */
export function fmtGpa(value: number | null | undefined, locale = 'ru'): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtDate(value: Date | string | null | undefined, locale = 'ru'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function fmtDateTime(value: Date | string | null | undefined, locale = 'ru'): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-GB' : 'ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Размер файла в человекочитаемом виде */
export function fmtBytes(bytes: number | bigint): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (n < 1024) return `${n} Б`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} МБ`;
  return `${(n / 1024 ** 3).toFixed(2)} ГБ`;
}

/** Минуты → «2 ч 15 мин» */
export function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Транслитерация для slug курса */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    а:'a',ә:'a',б:'b',в:'v',г:'g',ғ:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',қ:'q',
    л:'l',м:'m',н:'n',ң:'n',о:'o',ө:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ұ:'u',ү:'u',ф:'f',х:'h',
    һ:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',і:'i',ь:'',э:'e',ю:'yu',я:'ya',
  };
  return input
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Извлечение идентификатора видео из ссылки YouTube / Vimeo (F-T-06) */
export function parseVideoUrl(
  url: string
): { provider: 'youtube' | 'vimeo'; id: string } | null {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (yt) return { provider: 'youtube', id: yt[1] };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { provider: 'vimeo', id: vm[1] };
  return null;
}

/**
 * Русское склонение существительного при числительном:
 * 1 запись, 2 записи, 5 записей.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Инициалы для аватара */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
