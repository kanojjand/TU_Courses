import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-card className={cn('rounded-xl border border-border bg-surface shadow-sm', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-snug">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}
