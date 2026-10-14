import { LayoutTemplate, Plus } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { NewTemplateButton } from '@/components/reports/new-template';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { templates } from '@/lib/studio';
import { COURSE_TONE } from '@/lib/tones';

export default async function TemplatesPage() {
  const t = await getTranslations();
  const list = await templates();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('reports.academic.templates')} description={t('reports.academic.templatesHint')} actions={<NewTemplateButton />} />
      {list.length === 0 ? (
        <EmptyState icon={<LayoutTemplate />} title={t('common.empty')} />
      ) : (
        <ul data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
          {list.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <LayoutTemplate className="size-5 text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.title}</p>
                {c.description && <p className="text-sm text-fg-muted">{c.description}</p>}
              </div>
              <Badge tone={COURSE_TONE[c.status]}>{t(`statuses.course.${c.status}`)}</Badge>
              <Link href={`/studio/${c.id}`} className={buttonClass('secondary', 'sm')}>
                <Plus />
                {t('common.edit')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
