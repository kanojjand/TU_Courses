'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/** Светлая и тёмная тема (раздел 8.2 ТЗ) */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
    const saved = (() => {
      try {
        return localStorage.getItem('LMS_THEME') as 'light' | 'dark' | null;
      } catch {
        return null;
      }
    })();
    const initial =
      saved ??
      stored ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('LMS_THEME', next);
    } catch {
      // приватный режим браузера — сохранение недоступно
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-muted hover:text-fg"
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
