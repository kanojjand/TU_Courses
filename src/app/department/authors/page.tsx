import { getLocale, getTranslations } from 'next-intl/server';
import { AssignAuthorForm, RemoveAuthor } from '@/components/reports/assign-author';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader, Section } from '@/components/ui/page';
import { Table, Td, Th } from '@/components/ui/table';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { departmentDisciplines, departmentStaff, readiness } from '@/lib/department';
import { departmentScope } from '@/lib/rbac';
import { COURSE_TONE } from '@/lib/tones';
import { fullName, shortName } from '@/lib/utils';

export default async function AuthorsPage({ searchParams }: { searchParams: Promise<{ discipline?: string; lang?: string }> }) {
  const { discipline, lang } = await searchParams;
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const scope = await departmentScope(user, 'dept_head');
  const [discs, staff, { rows }] = await Promise.all([departmentDisciplines(scope), departmentStaff(scope), readiness(scope)]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.dept.authors')} description={t('reports.dept.authorsHint')} />
      <Card className="mb-7 p-5">
        <AssignAuthorForm
          disciplines={discs.map((d) => ({ id: d.id, label: `${d.code} · ${pickName(d, locale)}` }))}
          staff={staff.map((s) => ({ id: s.id, label: fullName(s) }))}
          defaultDiscipline={discipline}
          defaultLang={lang}
        />
      </Card>
      <Section title={t('nav.myCourses')}>
        <div data-card className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table>
            <thead>
              <tr>
                <Th>{t('common.course')}</Th>
                <Th>{t('common.status')}</Th>
                <Th>{t('reports.dept.authors')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.course.id}>
                  <Td>
                    <p className="font-medium">{r.course.title}</p>
                    <p className="text-xs text-fg-muted">
                      {r.discipline.code} · {r.course.language.toUpperCase()}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={COURSE_TONE[r.course.status]}>{t(`statuses.course.${r.course.status}`)}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {r.authors.map((a) => (
                        <RemoveAuthor key={a.id} courseId={r.course.id} userId={a.id} label={shortName(a)} />
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
