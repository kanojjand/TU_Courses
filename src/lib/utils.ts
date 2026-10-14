import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(u: { lastName: string; firstName: string; middleName?: string | null } | null | undefined) {
  if (!u) return '';
  return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ');
}

export function shortName(u: { lastName: string; firstName: string; middleName?: string | null } | null | undefined) {
  if (!u) return '';
  const initials = [u.firstName, u.middleName]
    .filter(Boolean)
    .map((p) => `${p![0]}.`)
    .join('');
  return `${u.lastName} ${initials}`.trim();
}

export function initials(u: { lastName: string; firstName: string }) {
  return `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Генератор понятных паролей без похожих символов (0/O, 1/l) */
export function generatePassword(length = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function groupBy<T, K extends string | number>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) (out[key(x)] ??= []).push(x);
  return out;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
