'use client';

import dynamic from 'next/dynamic';

/**
 * Обёртка над графиком распределения баллов.
 *
 * Страница аналитики — серверный компонент, а `next/dynamic` с отключённым
 * серверным рендерингом работает только в клиентском. Отдельная обёртка
 * позволяет не тянуть библиотеку графиков в начальную загрузку страницы.
 */
const ScoreChart = dynamic(() => import('./score-chart').then((m) => m.ScoreChart), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-muted" />,
});

export function ScoreChartLazy({ data }: { data: { range: string; count: number }[] }) {
  return <ScoreChart data={data} />;
}
