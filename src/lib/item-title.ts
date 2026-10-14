/**
 * Стандартные элементы журнала создаются с названиями «ТК1», «РК1», «Экзамен».
 * Такие названия показываем на языке интерфейса, свои — как есть.
 */
const DEFAULT_TITLES = new Set(['', 'ТК1', 'РК1', 'ТК2', 'РК2', 'Экзамен', 'TK1', 'RK1', 'TK2', 'RK2', 'EXAM']);

export function isDefaultItemTitle(title: string | null | undefined) {
  return DEFAULT_TITLES.has((title ?? '').trim());
}
