import { asc } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { SchemeForm } from '@/components/reports/scheme-form';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { gradeSchemes } from '@/db/schema';
import { DEFAULT_SCHEME } from '@/lib/progress';

export default async function SchemesPage() {
  const t = await getTranslations();
  const list = await db.select().from(gradeSchemes).orderBy(asc(gradeSchemes.title));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('reports.academic.schemes')} description={t('reports.academic.schemesHint')} />
      <div className="space-y-5">
        {list.map((s) => (
          <Card key={s.id} className="p-5">
            <SchemeForm id={s.id} initial={s} />
          </Card>
        ))}
        <Card className="border-dashed p-5">
          <p className="mb-3 font-semibold">{t('common.add')}</p>
          <SchemeForm id={null} initial={{ ...DEFAULT_SCHEME, title: '', isDefault: list.length === 0 }} />
        </Card>
      </div>
    </div>
  );
}
