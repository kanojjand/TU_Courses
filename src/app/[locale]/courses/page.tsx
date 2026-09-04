import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Prisma } from '@prisma/client';

import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { HOURS_PER_CREDIT } from '@/domain/constants';

export const revalidate = 600;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** F-P-02. Каталог курсов с фильтрами и поиском. */
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const t = await getTranslations('catalog');

  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const q = one('q')?.trim();
  const programId = one('program');
  const departmentId = one('department');
  const language = one('language');
  const level = one('level');
  const credits = one('credits');

  const where: Prisma.CourseWhereInput = {
    status: 'PUBLISHED',
    isPublic: true,
    discipline: {
      ...(programId ? { programId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(language ? { language: language as 'KK' | 'RU' | 'EN' } : {}),
      ...(level ? { level: level as 'BACHELOR' | 'MASTER' | 'PHD' } : {}),
      ...(credits ? { credits: Number(credits) } : {}),
      ...(q
        ? {
            OR: [
              { nameKk: { contains: q, mode: 'insensitive' } },
              { nameRu: { contains: q, mode: 'insensitive' } },
              { nameEn: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
  };

  const [courses, programs, departments, creditOptions] = await Promise.all([
    prisma.course.findMany({
      where,
      take: 60,
      orderBy: { publishedAt: 'desc' },
      include: {
        discipline: {
          include: { department: true, program: true },
        },
        period: { select: { name: true } },
        teachers: {
          where: { isLead: true },
          take: 1,
          include: {
            teacher: {
              select: { user: { select: { lastNameRu: true, firstNameRu: true } } },
            },
          },
        },
      },
    }).catch(() => []),
    prisma.educationProgram
      .findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
      .catch(() => []),
    prisma.department
      .findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
      .catch(() => []),
    prisma.discipline
      .findMany({
        where: { isActive: true },
        select: { credits: true },
        distinct: ['credits'],
        orderBy: { credits: 'asc' },
      })
      .catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('title')}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <CatalogFilters
          locale={locale}
          programs={programs.map((p) => ({ id: p.id, label: `${p.code} · ${pickLocalized(p, 'name', locale)}` }))}
          departments={departments.map((d) => ({ id: d.id, label: pickLocalized(d, 'name', locale) }))}
          creditOptions={creditOptions.map((c) => c.credits)}
        />

        <div>
          <p className="mb-4 text-sm text-fg-muted">{t('found', { count: courses.length })}</p>

          {courses.length === 0 ? (
            <EmptyState title={t('nothingFound')} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((c) => {
                const lead = c.teachers[0]?.teacher.user;
                return (
                  <li key={c.id}>
                    <Link href={`/courses/${c.slug}`} className="block h-full">
                      <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
                        <CardBody className="flex flex-1 flex-col">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            <Badge tone="brand">{c.discipline.credits} кр.</Badge>
                            <Badge>{c.discipline.credits * HOURS_PER_CREDIT} ч</Badge>
                            <Badge>{c.discipline.language}</Badge>
                            <Badge>{c.discipline.cycle}</Badge>
                          </div>
                          <h2 className="text-base font-semibold leading-snug">
                            {pickLocalized(c.discipline, 'name', locale)}
                          </h2>
                          <p className="mt-1 text-xs text-fg-muted">{c.discipline.code}</p>
                          {c.summaryRu && (
                            <p className="mt-2 line-clamp-3 text-sm text-fg-muted">
                              {pickLocalized(c, 'summary', locale)}
                            </p>
                          )}
                          <div className="mt-auto pt-3 text-xs text-fg-muted">
                            {lead && (
                              <p>
                                {t('teacher')}: {lead.lastNameRu} {lead.firstNameRu}
                              </p>
                            )}
                            <p>{pickLocalized(c.discipline.department, 'name', locale)}</p>
                          </div>
                        </CardBody>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
