'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** F-T-13. Распределение баллов по результатам тестов. */
export function ScoreChart({ data }: { data: { range: string; count: number }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-border))" vertical={false} />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11, fill: 'rgb(var(--c-fg-muted))' }}
            axisLine={{ stroke: 'rgb(var(--c-border))' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'rgb(var(--c-fg-muted))' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'rgb(var(--c-surface))',
              border: '1px solid rgb(var(--c-border))',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgb(var(--c-fg))',
            }}
            formatter={(value: number) => [`${value} попыток`, '']}
            labelFormatter={(label: string) => `Результат ${label} %`}
          />
          <Bar dataKey="count" fill="rgb(var(--c-brand))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
