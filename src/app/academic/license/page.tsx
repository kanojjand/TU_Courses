import { getTranslations } from 'next-intl/server';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page';
import { universityIndicators } from '@/lib/indicators';

export default async function LicensePage() {
  const t = await getTranslations();
  const ind = await universityIndicators();
  const keys = Object.keys(ind) as (keyof typeof ind)[];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('reports.academic.license')} description={t('reports.academic.licenseHint')} />
      <DataTable
        fileName="license_report"
        searchable={false}
        columns={[
          { key: 'name', header: t('reports.academic.indicator') },
          { key: 'value', header: t('reports.academic.value'), align: 'right' },
        ]}
        rows={keys.map((k) => ({ id: k, cells: { name: t(`reports.academic.ind.${k}`), value: ind[k] } }))}
      />
      <p className="mt-3 text-xs text-fg-muted">{new Date().toLocaleDateString('ru-RU')}</p>
    </div>
  );
}
