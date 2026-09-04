import { cn } from '@/lib/utils';

/**
 * Индикатор прогресса.
 * Раздел 8.2 ТЗ: прогресс выражается в понятных единицах, а не в абстрактных
 * процентах — поэтому подпись обязательна и передаётся явно.
 */
export function Progress({
  value,
  label,
  tone = 'brand',
  className,
}: {
  value: number;
  label?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bar = {
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-3 text-xs text-fg-muted">
          <span>{label}</span>
          <span className="tabular-nums font-medium text-fg">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
