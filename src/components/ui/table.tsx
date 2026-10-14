import * as React from 'react';
import { cn } from '@/lib/utils';

/** Простая таблица для серверных страниц; на телефоне прокручивается по горизонтали */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('border-b border-border bg-surface-2/60 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted whitespace-nowrap', className)}
      {...props}
    />
  );
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-border px-3 py-2.5 align-middle', className)} {...props} />;
}
