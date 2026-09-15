import type { MetadataRoute } from 'next';

/**
 * Манифест веб-приложения.
 *
 * Позволяет установить платформу на главный экран телефона («Добавить на
 * главный экран» в Chrome, «На экран Домой» в Safari): иконка университета,
 * запуск без адресной строки браузера, своя плитка в списке приложений.
 * Это тот же сайт и та же база — отдельной сборки под магазины не требуется.
 *
 * start_url ведёт в кабинет: установленное приложение открывают, чтобы
 * учиться, а не читать витрину. Гость оттуда попадёт на страницу входа.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tashenev University — онлайн-обучение',
    short_name: 'Tashenev',
    description: 'Платформа онлайн-обучения Tashenev University: курсы, задания, оценки и GPA.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#f90428',
    lang: 'ru',
    categories: ['education'],
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/brand/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
