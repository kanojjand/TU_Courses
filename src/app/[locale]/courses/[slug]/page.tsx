import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Lock } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { HOURS_PER_CREDIT } from '@/domain/constants';

export const revalidate = 600;

async function loadCourse(slug: string) {
  return prisma.course.findFirst({
    where: { slug, status: 'PUBLISHED', isPublic: true },
    include: {
      discipline: { include: { department: true, program: true } },
      period: { include: { academicYear: true } },
      syllabus: true,
      teachers: {
        include: {
          teacher: {
            include: {
              user: {
                select: {
                  lastNameKk: true, firstNameKk: true,
                  lastNameRu: true, firstNameRu: true,
                  lastNameEn: true, firstNameEn: true,
                },
              },
            },
          },
        },
      },
      modules: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true, title: true, weekNumber: true, orderIndex: true,
          _count: { select: { items: true } },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const course = await loadCourse(slug);
  if (!course) return { title: 'Курс не найден' };

  const title = pickLocalized(course.discipline, 'name', locale);
  const description =
    pickLocalized(course, 'summary', locale) ||
    `${course.discipline.credits} кредита · ${pickLocalized(course.discipline.department, 'name', locale)}`;

  // F-P-06: Open Graph для корректного отображения ссылок в мессенджерах
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
  };
}

/** F-P-03. Публичная карточка курса. Учебное содержимое не отображается. */
export default async function CoursePublicPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('catalog');
  const tc = await getTranslations('common');
  const course = await loadCourse(slug);
  if (!course) notFound();

  const d = course.discipline;
  const totalHours = d.credits * HOURS_PER_CREDIT;
  const outcomes = (pickLocalized(d, 'learningOutcomes', locale) || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const nameKey = locale === 'kk' ? 'Kk' : locale === 'en' ? 'En' : 'Ru';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav aria-label="Хлебные крошки" className="mb-4 text-sm text-fg-muted">
        <Link href="/courses" className="hover:text-fg">
          {t('title')}
        </Link>
        <span aria-hidden> / </span>
        <span>{d.code}</span>
      </nav>

      <header>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone="brand">{d.credits} кр. · {totalHours} ч</Badge>
          <Badge>{d.language}</Badge>
          <Badge>{d.cycle} / {d.component}</Badge>
          <Badge>{d.level}</Badge>
          <Badge>{course.period.name} · {course.period.academicYear.name}</Badge>
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">{pickLocalized(d, 'name', locale)}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {d.code} · {pickLocalized(d.department, 'name', locale)}
          {d.program && ` · ${d.program.code}`}
        </p>
      </header>

      {pickLocalized(course, 'summary', locale) && (
        <p className="mt-6 max-w-prose leading-relaxed">{pickLocalized(course, 'summary', locale)}</p>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {outcomes.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('outcomes')}</CardTitle></CardHeader>
              <CardBody>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                  {outcomes.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </CardBody>
            </Card>
          )}

          {course.modules.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('thematicPlan')}</CardTitle></CardHeader>
              <CardBody>
                <ol className="space-y-2 text-sm">
                  {course.modules.map((m) => (
                    <li key={m.id} className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
                      <span>
                        {m.weekNumber ? `Неделя ${m.weekNumber}. ` : `${m.orderIndex + 1}. `}
                        {m.title}
                      </span>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {m._count.items} элем.
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          {/* F-P-03: учебное содержимое неавторизованному пользователю недоступно */}
          <Alert tone="info">
            <span className="flex items-start gap-2">
              <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>{t('contentHidden')}</span>
            </span>
          </Alert>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t('teacher')}</CardTitle></CardHeader>
            <CardBody className="space-y-3 text-sm">
              {course.teachers.map((ct) => {
                const u = ct.teacher.user as Record<string, string>;
                return (
                  <div key={ct.id}>
                    <p className="font-medium">
                      {u[`lastName${nameKey}`]} {u[`firstName${nameKey}`]}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {ct.teacher.position}
                      {ct.teacher.academicDegree && `, ${ct.teacher.academicDegree}`}
                    </p>
                    {ct.isLead && <Badge tone="brand" className="mt-1">Ведущий</Badge>}
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2 text-sm">
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">Кредиты</dt>
                  <dd className="font-medium tabular-nums">{d.credits}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">Академических часов</dt>
                  <dd className="font-medium tabular-nums">{totalHours}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">Язык обучения</dt>
                  <dd className="font-medium">{d.language}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-muted">Компонент</dt>
                  <dd className="font-medium">{d.component}</dd>
                </div>
              </dl>
              <Link href="/login" className="block pt-2">
                <Button className="w-full">{tc('login')}</Button>
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
