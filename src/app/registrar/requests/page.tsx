import { Inbox } from 'lucide-react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { RequestActions } from '@/components/registrar/request-actions';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, Tabs } from '@/components/ui/page';
import { pickName } from '@/i18n/config';
import { pendingRequests } from '@/lib/registrar';
import { fullName, shortName } from '@/lib/utils';

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const decided = tab === 'decided';
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const list = await pendingRequests(decided ? 'decided' : 'pending');
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t('registrar.requests.title')} description={t('registrar.requests.subtitle')} />
      <Tabs
        active={decided ? '/registrar/requests?tab=decided' : '/registrar/requests'}
        items={[
          { href: '/registrar/requests', label: t('registrar.requests.pending') },
          { href: '/registrar/requests?tab=decided', label: t('registrar.requests.decided') },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState icon={<Inbox />} title={t('registrar.requests.empty')} />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <Card key={r.req.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{fullName(r.student)}</p>
                  <p className="text-sm text-fg-muted">
                    {pickName(r.discipline, locale)} · {r.offering.stream} · {t(`enums.component.${r.item.component}`)} «{r.item.title}»
                  </p>
                </div>
                <div className="flex items-center gap-3 text-center">
                  <div>
                    <p className="text-xs text-fg-muted">{t('registrar.requests.from')}</p>
                    <p className="text-lg font-semibold tabular-nums">{r.req.oldScore ?? '—'}</p>
                  </div>
                  <span className="text-fg-muted">→</span>
                  <div>
                    <p className="text-xs text-fg-muted">{t('registrar.requests.to')}</p>
                    <p className="text-lg font-bold text-brand tabular-nums">{r.req.newScore}</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-surface-2/70 p-3 text-sm">{r.req.reason}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
                <span>
                  {t('registrar.requests.by')}: {shortName(r.requester)} · {format.dateTime(r.req.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {r.req.status === 'pending' ? (
                  <RequestActions id={r.req.id} />
                ) : (
                  <span className="flex items-center gap-2">
                    <Badge tone={r.req.status === 'approved' ? 'success' : 'danger'}>{t(`statuses.request.${r.req.status}`)}</Badge>
                    {r.req.decisionComment}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
