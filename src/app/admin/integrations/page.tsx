import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { BunnyForm } from '@/components/admin/integrations-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { bunnyConfig } from '@/lib/bunny';
import { platonusApiConfigured } from '@/lib/platonus/adapter';
import { getSetting } from '@/lib/settings';

export default async function IntegrationsPage() {
  const t = await getTranslations();
  const [stored, cfg] = await Promise.all([getSetting<Record<string, string>>('bunny', {}), bunnyConfig()]);
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const secret = process.env.BUNNY_WEBHOOK_SECRET ? `?secret=${process.env.BUNNY_WEBHOOK_SECRET}` : '';
  const ok = (v: boolean) => <Badge tone={v ? 'success' : 'warning'}>{v ? t('common.configured') : t('common.notConfigured')}</Badge>;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={t('admin.integrations.title')} />
      <Card>
        <CardHeader title={t('admin.integrations.bunny')} description={t('admin.integrations.bunnyHint')} action={ok(!!cfg)} />
        <CardBody>
          <BunnyForm initial={{ libraryId: stored.libraryId ?? '', cdnHost: stored.cdnHost ?? '' }} hasKey={!!stored.apiKey} hasToken={!!stored.tokenKey} webhookUrl={`${origin}/api/bunny/webhook${secret}`} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('admin.integrations.platonus')} description={t('admin.integrations.platonusHint')} action={ok(platonusApiConfigured())} />
      </Card>
      <Card>
        <CardHeader
          title={t('admin.integrations.storage')}
          description={process.env.STORAGE_DRIVER === 's3' ? t('admin.integrations.storageS3') : t('admin.integrations.storageDb')}
          action={<Badge>{process.env.STORAGE_DRIVER === 's3' ? 'S3' : 'PostgreSQL'}</Badge>}
        />
      </Card>
    </div>
  );
}
