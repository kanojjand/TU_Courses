import { getTranslations } from 'next-intl/server';
import { ImportWizard } from '@/components/registrar/import-wizard';
import { PageHeader } from '@/components/ui/page';
import { IMPORT_KINDS, type ImportKind } from '@/lib/platonus/formats';

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const t = await getTranslations('registrar');
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('import.title')} description={t('subtitle')} />
      <ImportWizard initialKind={(IMPORT_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ImportKind) : undefined} />
    </div>
  );
}
