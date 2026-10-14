'use client';

import { DropdownMenu as M } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = 'end', ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg', className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn(
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] outline-none select-none',
        'data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn('px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-fg-muted', className)} {...props} />;
}

export function DropdownSeparator() {
  return <M.Separator className="my-1.5 h-px bg-border" />;
}
