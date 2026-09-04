import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-fg-muted',
  brand: 'bg-brand/12 text-brand',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/** Цвет по буквенной оценке (Приложение 1) */
export function gradeTone(letter: string | null | undefined): Tone {
  if (!letter) return 'neutral';
  if (letter === 'F') return 'danger';
  if (letter === 'FX') return 'warning';
  if (letter.startsWith('A')) return 'success';
  if (letter.startsWith('B')) return 'brand';
  return 'neutral';
}
