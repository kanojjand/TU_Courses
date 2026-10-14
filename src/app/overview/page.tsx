import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader, Section } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { db } from '@/db';
import { departments, faculties } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { avgOf, offeringStats } from '@/lib/analytics';
import { readinessByFaculty, universityIndicators } from '@/lib/indicators';

/** Один сводный дашборд для ректората — только просмотр */
export default async function RectorOverview() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [ind, byFaculty, stats, deps, facs] = await Promise.all([
    universityIndicators(),
    readinessByFaculty(),
    offeringStats({ all: true }),
    db.select().from(departments),
    db.select().from(faculties),
  ]);
  const readiness = byFaculty.reduce((s, f) => s + f.offerings, 0);
  const readyPct = readiness ? Math.round((byFaculty.reduce((s, f) => s + f.withCourse, 0) / readiness) * 100) : 0;
  const perFaculty = facs.map((f) => {
    const depIds = deps.filter((d) => d.facultyId === f.id).map((d) => d.id);
    const list = stats.filter((s) => s.discipline.departmentId && depIds.includes(s.discipline.departmentId));
    return { faculty: f, grade: avgOf(list.map((s) => s.avgGrade)), progress: avgOf(list.map((s) => s.avgProgress)), streams: list.length };
  });
  const Big = ({ label, value, hint, pct }: { label: string; value: string; hint: string; pct?: number }) => (
    <Card className="p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{value}</p>
      {pct !== undefined && <Progress value={pct} className="mt-3" tone={pct >= 80 ? 'success' : pct >= 40 ? 'warning' : 'danger'} />}
      <p className="mt-2 text-xs text-fg-muted">{hint}</p>
    </Card>
  );
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.rector.title')} actions={<Badge>{t('reports.rector.viewOnly')}</Badge>} />
      <div className="mb-7 grid gap-4 md:grid-cols-3">
        <Big label={t('reports.rector.coverage')} value={`${ind.coverage}%`} pct={ind.coverage} hint={t('reports.rector.coverageHint')} />
        <Big label={t('reports.rector.readiness')} value={`${readyPct}%`} pct={readyPct} hint={t('reports.rector.readinessHint')} />
        <Big label={t('reports.rector.activity')} value={String(ind.activeWeek)} hint={t('reports.rector.activityHint')} />
      </div>
      <Section title={t('reports.rector.byFaculty')}>
        <div className="grid gap-3 md:grid-cols-2">
          {perFaculty.map((f) => (
            <Card key={f.faculty.id} className="p-5">
              <p className="mb-3 font-semibold">{pickName(f.faculty, locale)}</p>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="text-fg-muted">{t('reports.rector.progress')}</span>
                    <span className="font-semibold">{f.progress === null ? '—' : `${f.progress}%`}</span>
                  </div>
                  <Progress value={f.progress ?? 0} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="text-fg-muted">{t('reports.rector.avgGrade')}</span>
                    <span className="font-semibold">{f.grade ?? '—'}</span>
                  </div>
                  <Progress value={f.grade ?? 0} tone="success" />
                </div>
                <p className="text-xs text-fg-muted">
                  {t('reports.dept.streams')}: {f.streams}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Section title={t('reports.academic.license')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(['students', 'teachers', 'courses', 'videos', 'videoHours', 'quizzes', 'attempts', 'submissions'] as const).map((k) => (
            <Card key={k} className="p-4">
              <p className="text-xs text-fg-muted">{t(`reports.academic.ind.${k}`)}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{ind[k]}</p>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
