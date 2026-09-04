import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { routing } from '@/i18n/routing';

const BASE = process.env.AUTH_URL ?? 'http://localhost:3000';

/** F-P-06: sitemap.xml для индексации публичной витрины */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/courses', '/about', '/support', '/rules', '/privacy'];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const p of staticPaths) {
      entries.push({
        url: `${BASE}/${locale}${p}`,
        lastModified: new Date(),
        changeFrequency: p === '' ? 'weekly' : 'monthly',
        priority: p === '' ? 1 : 0.6,
      });
    }
  }

  const courses = await prisma.course
    .findMany({
      where: { status: 'PUBLISHED', isPublic: true },
      select: { slug: true, updatedAt: true },
      take: 5000,
    })
    .catch(() => []);

  for (const locale of routing.locales) {
    for (const c of courses) {
      entries.push({
        url: `${BASE}/${locale}/courses/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return entries;
}
