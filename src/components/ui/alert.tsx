import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  info: 'border-brand/30 bg-brand/8 text-fg',
  success: 'border-success/30 bg-success/8 text-fg',
  warning: 'border-warning/40 bg-warning/8 text-fg',
  danger: 'border-danger/40 bg-danger/8 text-fg',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)} role="alert">
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
