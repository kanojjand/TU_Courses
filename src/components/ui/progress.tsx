import { cn } from '@/lib/utils';

export function Progress({
  value,
  className,
  tone = 'brand',
  label,
}: {
  value: number;
  className?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color = { brand: 'bg-brand', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2 border border-border/60', className)}
    >
      <div className={cn('h-full rounded-full transition-[width]', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 44 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${v}%`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={v >= 100 ? 'var(--success)' : 'var(--brand)'}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 3.6} fontWeight={600} fill="var(--fg)">
        {v}%
      </text>
    </svg>
  );
}
