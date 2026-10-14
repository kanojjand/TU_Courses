/** Строка на трёх языках: [ru, kk, en]. Переводы лежат рядом — их трудно рассинхронизировать. */
export type Tri = readonly [ru: string, kk: string, en: string];
export const t = (ru: string, kk: string, en: string): Tri => [ru, kk, en] as const;

export type TriTree = { readonly [key: string]: Tri | TriTree };
export type ToMessages<T> = { [K in keyof T]: T[K] extends Tri ? string : ToMessages<T[K]> };
