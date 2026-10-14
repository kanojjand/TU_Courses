import type { AppLocale } from './config';
import type { ToMessages, Tri, TriTree } from './t';
import { dict } from './dict';

const INDEX: Record<AppLocale, number> = { ru: 0, kk: 1, en: 2 };

function isTri(v: unknown): v is Tri {
  return Array.isArray(v) && v.length === 3 && typeof v[0] === 'string';
}

function pick(tree: TriTree, i: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tree)) out[k] = isTri(v) ? v[i] || v[0] : pick(v as TriTree, i);
  return out;
}

export type Messages = ToMessages<typeof dict>;

const cache = new Map<AppLocale, Messages>();

export function buildMessages(locale: AppLocale): Messages {
  let m = cache.get(locale);
  if (!m) {
    m = pick(dict, INDEX[locale]) as Messages;
    cache.set(locale, m);
  }
  return m;
}
