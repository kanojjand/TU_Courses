import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Table, Td, Th } from '@/components/ui/table';
import { BATCH_TONE } from '@/lib/tones';
import { pickName } from '@/i18n/config';
import { sheetStatuses } from '@/lib/sheets';
import { ConfirmSheetButton } from './sheet-panel';

export async function SheetsTable({
  offerings,
  canConfirm,
}: {
  offerings: { id: string; stream: string; discipline: { nameKk: string; nameRu: string; nameEn: string } }[];
  canConfirm: boolean;
}) {
  const [t, format, locale] = await Promise.all([getTranslations(), getFormatter(), getLocale()]);
  const statuses = await sheetStatuses(offerings.map((o) => o.id));
  const now = Date.now();
  return (
    <div data-card className="overflow-hidden rounded-xl border border-border bg-surface">
      <Table>
        <thead>
          <tr>
            <Th>{t('common.stream')}</Th>
            <Th>{t('teach.journal.component')}</Th>
            <Th>{t('common.status')}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {statuses
            .filter((s) => s.hasItems)
            .map((s) => {
              const o = offerings.find((x) => x.id === s.offeringId)!;
              const label = t(`enums.component.${s.component}`);
              const windowOpen = !s.window || (s.window.startsAt.getTime() <= now + 14 * 86400_000);
              return (
                <tr key={`${s.offeringId}-${s.component}`}>
                  <Td>
                    <Link href={`/teach/${o.id}`} className="font-medium hover:text-brand">
                      {pickName(o.discipline, locale)}
                    </Link>
                    <p className="text-xs text-fg-muted">{o.stream}</p>
                  </Td>
                  <Td>
                    <p className="font-medium">{label}</p>
                    {s.window && (
                      <p className="text-xs text-fg-muted">
                        {t('teach.sheets.window', {
                          from: format.dateTime(s.window.startsAt, { day: 'numeric', month: 'short' }),
                          to: format.dateTime(s.window.endsAt, { day: 'numeric', month: 'short' }),
                        })}
                      </p>
                    )}
                  </Td>
                  <Td>
                    {s.batch ? <Badge tone={BATCH_TONE[s.batch.status]}>{t(`statuses.batch.${s.batch.status}`)}</Badge> : <Badge>{t('teach.sheets.notCreated')}</Badge>}
                    {s.batch?.status === 'rejected' && s.batch.comment && <p className="mt-1 text-xs text-danger">{t('teach.sheets.rejectedNote', { comment: s.batch.comment })}</p>}
                  </Td>
                  <Td className="text-right">
                    {canConfirm && (!s.batch || s.batch.status === 'rejected') && windowOpen && <ConfirmSheetButton offeringId={o.id} component={s.component} label={label} />}
                  </Td>
                </tr>
              );
            })}
        </tbody>
      </Table>
    </div>
  );
}
