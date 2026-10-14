'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          'fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-surface shadow-xl',
          'inset-x-0 bottom-0 rounded-t-2xl sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-lg font-semibold leading-snug">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
            )}
          </div>
          <D.Close className="-mr-2 -mt-1 inline-flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
