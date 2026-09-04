import type { Config } from 'tailwindcss';

/**
 * Дизайн-токены (раздел 8.2 ТЗ): нейтральная тема до получения брендбука вуза.
 * Замена палитры выполняется централизованно правкой CSS-переменных в globals.css.
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
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
      },
      fontFamily: {
        // Раздел F-L-05: шрифт обязан отображать ә ғ қ ң ө ұ ү һ і
        sans: ['var(--font-ui)', 'Inter', 'Noto Sans', 'system-ui', 'sans-serif'],
      },
      maxWidth: { prose: '72ch' },
      borderRadius: { xl: '0.875rem' },
    },
  },
  plugins: [],
};
export default config;
