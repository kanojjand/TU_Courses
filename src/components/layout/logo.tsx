/**
 * Знак Tashenev University.
 *
 * Источник — официальный файл университета (tashenev.edu.kz), вырезанный
 * знак лежит в `public/brand/tu-mark.png`. Из него же выведена палитра
 * интерфейса, см. комментарий в `src/app/globals.css`.
 *
 * Знак подключён маской, а не картинкой: цвет берётся из `currentColor`,
 * поэтому один файл одинаково работает на светлой теме (фирменный красный),
 * на тёмной и на красной подложке (белый знак). Заменить знак — значит
 * положить другой файл по тому же пути; правок в компонентах не потребуется.
 */
const MARK_URL = 'url(/brand/tu-mark.png)';
const MARK_RATIO = '229 / 288';

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className ?? ''}`}
      style={{
        aspectRatio: MARK_RATIO,
        WebkitMaskImage: MARK_URL,
        maskImage: MARK_URL,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

/**
 * Знак вместе со словесной частью — для шапки и подвала.
 *
 * Начертание словесной части повторяет логотип: «TASHENEV» — плотные
 * прописные, «UNIVERSITY» — разрядка. `compact` убирает словесную часть:
 * на узких экранах она съедает место, которое нужнее навигации.
 */
export function Logo({
  className,
  compact = false,
  subtitle,
}: {
  className?: string;
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={`flex shrink-0 items-center gap-2.5 ${className ?? ''}`}>
      <LogoMark className="h-8 w-auto text-brand-vivid" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[0.9375rem] font-bold uppercase tracking-[0.06em] text-fg">
            Tashenev
          </span>
          {subtitle && (
            <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
