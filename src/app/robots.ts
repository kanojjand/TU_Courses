import type { MetadataRoute } from 'next';

const BASE = process.env.AUTH_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        // Приватные разделы не индексируются
        disallow: ['/api/', '/*/dashboard', '/*/my/', '/*/teach', '/*/admin'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
