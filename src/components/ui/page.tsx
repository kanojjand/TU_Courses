import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn('mb-5 sm:mb-6', className)}>
      {back && (
        <Link href={back.href} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1 text-[0.9375rem] text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  text?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-fg-muted [&_svg]:size-10">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-fg-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  href?: string;
}) {
  const color = tone ? { brand: 'text-brand', success: 'text-success', warning: 'text-warning', danger: 'text-danger' }[tone] : 'text-fg';
  const body = (
    <>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={cn('mt-1 text-[1.75rem] font-bold leading-none tabular-nums', color)}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
    </>
  );
  const cls = 'block rounded-xl border border-border bg-surface p-4 shadow-sm';
  return href ? (
    <Link href={href} data-card className={cn(cls, 'transition-colors hover:border-brand/40')}>
      {body}
    </Link>
  ) : (
    <div data-card className={cls}>
      {body}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mb-7', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: React.ReactNode; count?: number }[]; active: string }) {
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="tabs">
      <div className="flex min-w-max gap-1 border-b border-border">
        {items.map((it) => {
          const on = it.href === active;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-[0.9375rem] font-medium whitespace-nowrap',
                on ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {it.label}
              {typeof it.count === 'number' && it.count > 0 && (
                <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-fg">{it.count}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const cls = {
    info: 'border-info/25 bg-info-soft text-info',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    danger: 'border-danger/25 bg-danger-soft text-danger',
    success: 'border-success/25 bg-success-soft text-success',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', cls, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-0.5', 'text-fg')}>{children}</div>}
    </div>
  );
}
