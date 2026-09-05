import type { Config } from 'tailwindcss';

/**
 * Дизайн-токены (раздел 8.2 ТЗ): палитра Tashenev University.
 * Значения задаются CSS-переменными в globals.css — здесь только привязка,
 * поэтому смена брендбука не требует правки конфигурации.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--c-fg-muted) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        'brand-fg': 'rgb(var(--c-brand-fg) / <alpha-value>)',
        'brand-soft': 'rgb(var(--c-brand-soft) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        // Раздел F-L-05: шрифт обязан отображать ә ғ қ ң ө ұ ү һ і
        sans: ['var(--font-ui)', 'Inter', 'Noto Sans', 'system-ui', 'sans-serif'],
      },
      maxWidth: { prose: '72ch' },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': '1.75rem',
      },
      boxShadow: {
        sm: 'var(--sh-sm)',
        DEFAULT: 'var(--sh-sm)',
        md: 'var(--sh-md)',
        lg: 'var(--sh-lg)',
        brand: 'var(--sh-brand)',
      },
      fontSize: {
        // Крупная витринная типографика: на телефоне заголовок не должен
        // занимать пол-экрана, поэтому шаг задан через clamp
        display: ['clamp(2rem, 5.2vw, 3.5rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        headline: ['clamp(1.375rem, 3vw, 2rem)', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { 'fade-up': 'fade-up 0.35s ease-out both' },
    },
  },
  plugins: [],
};
export default config;
