import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookOpen, GraduationCap, Users, Layers } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/prisma';
import { pickLocalized } from '@/i18n/request';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';

export const revalidate = 3600; // ISR: витрина обновляется раз в час

/** F-P-01. Главная: назначение платформы, направления, статистика, призыв к действию. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const tc = await getTranslations('common');

  // Витрина не должна отдавать ошибку при недоступности БД: показываются
  // нулевые значения, страница остаётся работоспособной (раздел 6.2).
  const [courses, programs, teachers, students, faculties] = await Promise.all([
    prisma.course.count({ where: { status: 'PUBLISHED', isPublic: true } }).catch(() => 0),
    prisma.educationProgram.count({ where: { isActive: true } }).catch(() => 0),
    prisma.teacherProfile.count().catch(() => 0),
    prisma.studentProfile.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
    prisma.faculty
      .findMany({
        where: { isActive: true },
        include: {
          departments: {
            include: { _count: { select: { programs: true } } },
          },
        },
        take: 6,
      })
      .catch(() => []),
  ]);

  const stats = [
    { icon: BookOpen, value: courses, label: t('statCourses') },
    { icon: Layers, value: programs, label: t('statPrograms') },
    { icon: GraduationCap, value: teachers, label: t('statTeachers') },
    { icon: Users, value: students, label: t('statStudents') },
  ];

  const features = [
    { title: t('f1Title'), text: t('f1Text') },
    { title: t('f2Title'), text: t('f2Text') },
    { title: t('f3Title'), text: t('f3Text') },
  ];

  return (
    <>
      <section className="border-b border-border bg-gradient-to-b from-brand/8 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold leading-tight sm:text-5xl">{t('heroTitle')}</h1>
            <p className="mt-5 max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg">
              {t('heroSubtitle')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses">
                <Button size="lg">{t('ctaCatalog')}</Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  {t('ctaLogin')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ icon: Icon, value, label }) => (
            <Card key={label}>
              <CardBody className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
                  <Icon size={18} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                  <dt className="truncate text-xs text-fg-muted">{label}</dt>
                </div>
              </CardBody>
            </Card>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <h2 className="text-xl font-semibold">{t('featuresTitle')}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardBody>
                <h3 className="text-base">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.text}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {faculties.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-20">
          <h2 className="text-xl font-semibold">{t('directionsTitle')}</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {faculties.map((f) => {
              const programCount = f.departments.reduce((s, d) => s + d._count.programs, 0);
              return (
                <li key={f.id}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardBody>
                      <p className="font-medium">{pickLocalized(f, 'name', locale)}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {f.departments.length} кафедр · {programCount} {tc('of')} программ
                      </p>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
