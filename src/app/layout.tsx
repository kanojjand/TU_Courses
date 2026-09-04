import type { ReactNode } from 'react';
import './globals.css';

/**
 * Корневой layout. Локаль и <html lang> задаются во вложенном [locale]/layout.tsx —
 * здесь только подключение стилей, так как Next требует наличие корневого layout.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
