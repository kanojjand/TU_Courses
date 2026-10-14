import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { db } from '@/db';
import { departments, programs, students, studyGroups, users } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { COMPONENT_ORDER } from '@/lib/grades';
import { facultyScope, groupScope, inScope, userHasRole } from '@/lib/rbac';
import { studentCourses, studentGradebook } from '@/lib/student';
import { fullName, isUuid } from '@/lib/utils';

/** Карточка студента — только просмотр (эдвайзер, деканат, офисы) */
export default async function StudentCard({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!isUuid(studentId)) notFound();
  const viewer = await requireUser();
  const [row] = await db
    .select({ user: users, student: students, group: studyGroups, facultyId: departments.facultyId })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .leftJoin(studyGroups, eq(studyGroups.id, students.groupId))
    .leftJoin(programs, eq(programs.id, studyGroups.programId))
    .leftJoin(departments, eq(departments.id, programs.departmentId))
    .where(eq(students.userId, studentId));
  if (!row) notFound();
  const office = ['registrar', 'academic_office', 'rector', 'admin'].some((r) => userHasRole(viewer, r as 'admin'));
  const advisor = userHasRole(viewer, 'advisor') && inScope(await groupScope(viewer, 'advisor'), row.student.groupId);
  const dean = userHasRole(viewer, 'dean') && inScope(await facultyScope(viewer, 'dean'), row.facultyId);
  if (!office && !advisor && !dean) notFound();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [{ courses }, book] = await Promise.all([studentCourses(studentId), studentGradebook(studentId)]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={fullName(row.user)} description={`${row.group?.code ?? '—'} · ${row.user.login} · ${t(`statuses.student.${row.student.status}`)}`} />
      <Badge className="mb-5">{t('reports.rector.viewOnly')}</Badge>
      <h2 className="mb-3 text-lg font-semibold">{t('nav.myCourses')}</h2>
      <div className="mb-7 grid gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <Card key={c.offering.id} className="p-4">
            <p className="font-medium">{c.snap?.title ?? pickName(c.discipline, locale)}</p>
            <div className="mt-2 flex items-center gap-2">
              <Progress value={c.progress?.percent ?? 0} />
              <span className="text-sm whitespace-nowrap text-fg-muted">{c.progress ? t('learn.lessonsDone', { done: c.progress.completed, total: c.progress.total }) : '—'}</span>
            </div>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 text-lg font-semibold">{t('learn.grades.title')}</h2>
      <div className="space-y-3">
        {book.map((b) => (
          <Card key={b.offering.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {pickName(b.discipline, locale)} <span className="text-sm text-fg-muted">· {b.offering.stream}</span>
              </p>
              <Badge tone={b.rating.admitted ? 'success' : 'warning'}>
                {t('learn.grades.admission')}: {b.rating.rating}
              </Badge>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-2 text-center text-sm">
              {COMPONENT_ORDER.map((c) => (
                <div key={c} className="rounded-lg bg-surface-2/70 p-2">
                  <p className="text-xs text-fg-muted">{t(`enums.component.${c}`)}</p>
                  <p className="font-semibold">{b.comps[c] ?? '—'}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
