import { asc, count, eq } from 'drizzle-orm';
import { Building2, Upload } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { departments, faculties, programs, students, studyGroups } from '@/db/schema';
import { pickName } from '@/i18n/config';

export default async function StructurePage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [facs, deps, progs, groups, counts] = await Promise.all([
    db.select().from(faculties).orderBy(asc(faculties.code)),
    db.select().from(departments).orderBy(asc(departments.code)),
    db.select().from(programs).orderBy(asc(programs.code)),
    db.select().from(studyGroups).orderBy(asc(studyGroups.code)),
    db.select({ g: students.groupId, n: count() }).from(students).where(eq(students.status, 'studying')).groupBy(students.groupId),
  ]);
  const n = (g: string) => counts.find((c) => c.g === g)?.n ?? 0;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('admin.structure.title')}
        description={t('admin.structure.subtitle')}
        actions={
          <Link href="/registrar/import?kind=faculties" className={buttonClass('secondary')}>
            <Upload />
            {t('admin.structure.toImport')}
          </Link>
        }
      />
      {facs.length === 0 ? (
        <EmptyState icon={<Building2 />} title={t('admin.structure.empty')} />
      ) : (
        <div className="space-y-4">
          {facs.map((f) => (
            <Card key={f.id} className="p-5">
              <p className="text-lg font-semibold">
                {pickName(f, locale)} <span className="text-sm font-normal text-fg-muted">· {f.code}</span>
              </p>
              <ul className="mt-3 space-y-3">
                {deps
                  .filter((d) => d.facultyId === f.id)
                  .map((d) => (
                    <li key={d.id} className="border-l-2 border-border pl-4">
                      <p className="font-medium">
                        {pickName(d, locale)} <span className="text-sm text-fg-muted">· {d.code}</span>
                      </p>
                      <ul className="mt-1 space-y-1 text-sm">
                        {progs
                          .filter((p) => p.departmentId === d.id)
                          .map((p) => {
                            const gs = groups.filter((g) => g.programId === p.id);
                            return (
                              <li key={p.id}>
                                <span className="font-mono text-fg-muted">{p.code}</span> {pickName(p, locale)} — {t('admin.structure.groups', { n: gs.length })}
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {gs.map((g) => (
                                    <span key={g.id} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs">
                                      {g.code} · {t('admin.structure.studentsN', { n: n(g.id) })}
                                    </span>
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
