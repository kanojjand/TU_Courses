import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { requirePageAccess } from '@/server/guards';
import { getCurriculum, compareCurricula } from '@/server/curriculum';
import { Link } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

const KIND: Record<string, { label: string; tone: 'success' | 'danger' | 'brand' }> = {
  added: { label: 'добавлено', tone: 'success' },
  removed: { label: 'удалено', tone: 'danger' },
  changed: { label: 'изменено', tone: 'brand' },
};

/**
 * F-CUR-10. Сравнение двух версий учебного плана: что добавлено, удалено
 * и изменено в кредитах, часах, цикле и форме контроля.
 */
export default async function CompareCurriculaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { locale, id } = await params;
  const { with: otherId } = await searchParams;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'curriculum:view');

  const base = await getCurriculum(id);
  if (!base) notFound();
  const other = otherId ? await getCurriculum(otherId) : null;

  if (!other) {
    return (
      <>
        <Link
          href={`/admin/curricula/${id}`}
          className="text-sm text-fg-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← К плану
        </Link>
        <div className="mt-4">
          <EmptyState
            title="Версия для сравнения не выбрана"
            description="Откройте сравнение из карточки плана — в блоке «Другие версии»."
          />
        </div>
      </>
    );
  }

  // Сравниваем «от старой к новой»: пользователь ждёт, что «добавлено»
  // относится к более поздней версии, независимо от того, из какой он пришёл
  const [older, newer] =
    other.admissionYear < base.admissionYear ||
    (other.admissionYear === base.admissionYear && other.version < base.version)
      ? [other, base]
      : [base, other];

  const diffs = compareCurricula(older, newer);
  const label = (c: typeof base) => `набор ${c.admissionYear}, в. ${c.version}`;

  return (
    <>
      <Link
        href={`/admin/curricula/${id}`}
        className="text-sm text-fg-muted underline-offset-2 hover:text-brand hover:underline"
      >
        ← К плану
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Сравнение версий плана</h1>
      <p className="mb-5 text-sm text-fg-muted">
        {base.program.code} · {label(older)} → {label(newer)}
      </p>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Было" credits={Number(older.totalCredits ?? 0)} hours={older.totalHours ?? 0} slots={older.slots.length} />
        <SummaryCard title="Стало" credits={Number(newer.totalCredits ?? 0)} hours={newer.totalHours ?? 0} slots={newer.slots.length} />
        <Card>
          <CardBody>
            <p className="text-xs text-fg-muted">Расхождений</p>
            <p className="text-2xl font-bold tabular-nums">{diffs.length}</p>
          </CardBody>
        </Card>
      </div>

      {diffs.length === 0 ? (
        <EmptyState title="Версии совпадают" description="Различий в позициях плана не найдено." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Различия ({diffs.length})</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {diffs.map((d, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={KIND[d.kind].tone}>{KIND[d.kind].label}</Badge>
                  {d.slotCode && <span className="font-mono text-xs text-fg-muted">{d.slotCode}</span>}
                  <span className="text-sm font-medium">{d.nameRu}</span>
                </div>
                {d.changes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {d.changes.map((c) => (
                      <li key={c.field} className="flex flex-wrap gap-x-2">
                        <span className="text-fg-muted">{c.label}:</span>
                        <span className="text-danger line-through">{c.before}</span>
                        <span aria-hidden>→</span>
                        <span className="font-medium text-success">{c.after}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}

function SummaryCard({
  title,
  credits,
  hours,
  slots,
}: {
  title: string;
  credits: number;
  hours: number;
  slots: number;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs text-fg-muted">{title}</p>
        <p className="text-2xl font-bold tabular-nums">{credits} кр</p>
        <p className="text-sm text-fg-muted">
          {hours} ч · {slots} позиций
        </p>
      </CardBody>
    </Card>
  );
}
