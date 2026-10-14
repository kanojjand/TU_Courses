import * as React from 'react';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  brand: 'bg-brand-soft text-brand border-brand/20',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info-soft text-info border-info/20',
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
