/**
 * Знак Tashenev University.
 *
 * ВРЕМЕННЫЙ ЗНАК. До получения официального файла из брендбука (п. 14.1.8 ТЗ)
 * используется монограмма «TU», нарисованная фирменным багровым. Заменить —
 * значит подменить содержимое <svg> ниже или отдать вместо него <Image>
 * с файлом из /public. Все остальные места берут знак отсюда, поэтому
 * править нужно только этот файл.
 *
 * Знак наследует currentColor, поэтому одинаково работает на светлой и
 * тёмной теме и не требует отдельного варианта.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      aria-hidden
      focusable="false"
    >
      {/* Дуга «U» */}
      <path
        d="M10 9v12.5a10 10 0 0 0 20 0V9"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* Перекладина и стойка «T» */}
      <path d="M13.5 9h13" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M20 9v9" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Знак вместе со словесной частью — для шапки и подвала.
 *
 * `compact` убирает словесную часть: на узких экранах она съедает место,
 * которое нужнее навигации.
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
      <LogoMark className="h-8 w-8 text-brand" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[0.9375rem] font-bold tracking-tight text-fg">
            Tashenev
          </span>
          {subtitle && (
            <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-fg-muted">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
