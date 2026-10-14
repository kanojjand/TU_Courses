import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-fg border border-border hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
  link: 'text-brand underline-offset-4 hover:underline px-0 h-auto',
} as const;

const sizes = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[0.9375rem] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-11 w-11',
  'icon-sm': 'h-9 w-9',
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
};

export function buttonClass(variant: keyof typeof variants = 'primary', size: keyof typeof sizes = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors select-none',
    'disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-[1.15em] [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    extra,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={buttonClass(variant, size, className)} {...props} />;
});
