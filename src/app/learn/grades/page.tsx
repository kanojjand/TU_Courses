import { GraduationCap } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Table, Td, Th } from '@/components/ui/table';
import type { GradeComponent } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { COMPONENT_ORDER } from '@/lib/grades';
import { studentGradebook } from '@/lib/student';
import { shortName } from '@/lib/utils';

export default async function GradesPage() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const book = await studentGradebook(user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('learn.grades.title')} description={t('learn.grades.subtitle')} />
      {book.length === 0 && <EmptyState icon={<GraduationCap />} title={t('learn.grades.noGrades')} />}
      <div className="space-y-5">
        {book.map((b) => (
          <Card key={b.offering.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{pickName(b.discipline, locale)}</h2>
                <p className="text-sm text-fg-muted">
                  {t(`enums.lessonType.${b.offering.lessonType}`)} · {b.offering.stream}
                  {b.teacher?.lastName ? ` · ${shortName(b.teacher)}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-fg-muted">{t('learn.grades.admission')}</p>
                <p className="text-2xl font-bold tabular-nums">{b.rating.rating}</p>
                {b.rating.admitted ? (
                  <Badge tone="success">{t('learn.grades.admitted')}</Badge>
                ) : (
                  <Badge tone="warning">{t('learn.grades.notAdmitted', { n: b.scheme.admissionThreshold })}</Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 divide-x divide-border border-b border-border text-center">
              {COMPONENT_ORDER.map((c) => (
                <div key={c} className="px-1 py-3">
                  <p className="text-xs text-fg-muted">{t(`enums.component.${c}`)}</p>
                  <p className="text-lg font-semibold tabular-nums">{b.comps[c] ?? '—'}</p>
                </div>
              ))}
            </div>
            {b.rk && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm sm:px-5">
                {(['rk1', 'rk2'] as const).map((k) => {
                  const r = b.rk![k];
                  return (
                    <span key={k}>
                      {t('learn.grades.rkAdmission', { rk: t(`enums.component.${k === 'rk1' ? 'RK1' : 'RK2'}`) })}:{' '}
                      <span className={r.admitted ? 'font-medium text-success' : 'font-medium text-warning'}>
                        {r.admitted ? t('learn.grades.rkOk') : t('learn.grades.rkMissing', { lessons: r.missingLessons, videos: r.missingVideos })}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
            {b.items.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>{t('learn.grades.item')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th className="text-right">{t('common.score')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {b.items.map(({ item, grade }) => (
                    <tr key={item.id}>
                      <Td>
                        <span className="mr-2 text-xs text-fg-muted">{t(`enums.component.${item.component as GradeComponent}`)}</span>
                        {item.title}
                      </Td>
                      <Td>
                        {grade ? (
                          <span className="inline-flex flex-wrap gap-1">
                            <Badge tone={grade.status === 'confirmed' ? 'success' : 'neutral'}>{t(`statuses.grade.${grade.status}`)}</Badge>
                            {grade.isLate && <Badge tone="danger">{t('common.late')}</Badge>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums">{grade ? grade.score : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        ))}
      </div>
      {book.length > 0 && <p className="mt-4 text-sm text-fg-muted">{t('learn.grades.finalNote')}</p>}
    </div>
  );
}
