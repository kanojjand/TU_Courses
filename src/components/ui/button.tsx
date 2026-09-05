import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg shadow-brand hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:shadow-none',
  secondary: 'bg-muted text-fg hover:bg-border disabled:opacity-40',
  outline: 'border border-border bg-surface text-fg hover:border-brand hover:text-brand disabled:opacity-40',
  ghost: 'text-fg hover:bg-brand-soft hover:text-brand disabled:opacity-40',
  danger: 'bg-danger text-white hover:brightness-110 disabled:opacity-40',
};

/**
 * Высота на мобильных не опускается ниже 40 px: рекомендация по размеру
 * области нажатия (раздел 6.5 ТЗ, доступность с телефона).
 */
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm sm:h-10',
  lg: 'h-12 px-7 text-base',
  icon: 'h-10 w-10',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-[filter,background-color,border-color,color,box-shadow] duration-150',
        'disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
