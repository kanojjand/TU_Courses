import { cn } from '@/lib/utils';

/** Знак университета красится текущим цветом (маска), рядом — «TU Online» */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        aspectRatio: '229 / 288',
        WebkitMaskImage: 'url(/brand/tu-mark.png)',
        maskImage: 'url(/brand/tu-mark.png)',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

export function Logo({ className, compact, wordmarkClass }: { className?: string; compact?: boolean; wordmarkClass?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="h-8 text-brand" />
      {!compact && (
        <span className={cn('text-[1.15rem] leading-none font-extrabold tracking-tight', wordmarkClass)}>
          TU <span className="text-brand">Online</span>
        </span>
      )}
    </span>
  );
}
