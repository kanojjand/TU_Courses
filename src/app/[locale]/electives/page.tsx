import { setRequestLocale, getTranslations } from 'next-intl/server';

import { pickLocalized } from '@/i18n/request';
import { electiveCatalog, electiveCatalogYears } from '@/server/curriculum';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { Link } from '@/i18n/routing';
import { CONTROL_FORM_LABELS, CYCLE_LABELS } from '@/domain/goso';

export const dynamic = 'force-dynamic';

/**
 * F-CUR-11. Каталог элективных дисциплин.
 *
 * Формируется из утверждённых учебных планов автоматически: отдельной
 * сущности КЭД нет, иначе каталог и план расходились бы при каждой правке.
 * Страница открыта всем — студент выбирает дисциплины до входа в ИУП.
 */
export default async function ElectivesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale } = await params;
  const { year } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('nav');

  const years = await electiveCatalogYears();
  const selectedYear = year ? Number(year) : years[0];
  const catalog = await electiveCatalog(
    Number.isFinite(selectedYear) ? { admissionYear: selectedYear } : {}
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{t('electives')}</h1>
      <p className="mt-2 max-w-prose text-sm text-fg-muted">
        Дисциплины компонента по выбору из утверждённых учебных планов. Из каждой позиции
        студент изучает указанное число дисциплин — выбор фиксируется в индивидуальном
        учебном плане.
      </p>

      {years.length > 1 && (
        <nav aria-label="Год набора" className="mt-4 flex flex-wrap gap-1.5">
          {years.map((y) => (
            <Link
              key={y}
              href={`/electives?year=${y}`}
              aria-current={y === selectedYear ? 'page' : undefined}
              className={
                y === selectedYear
                  ? 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg'
                  : 'rounded-lg border border-border px-3 py-1.5 text-sm text-fg-muted hover:border-brand hover:text-brand'
              }
            >
              Набор {y}
            </Link>
          ))}
        </nav>
      )}

      {catalog.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Каталог пуст"
            description="Каталог формируется из утверждённых учебных планов. Как только план пройдёт валидатор ГОСО и будет утверждён, его элективные дисциплины появятся здесь."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {catalog.map((c) => (
            <Card key={c.curriculumId}>
              <CardHeader>
                <CardTitle>
                  {c.program.code} · {pickLocalized(c.program, 'name', locale)}
                </CardTitle>
                <p className="mt-0.5 text-sm text-fg-muted">
                  Набор {c.admissionYear} · {c.slots.length} позиций по выбору ·{' '}
                  {c.slots.reduce((a, s) => a + s.credits, 0)} кредитов
                </p>
              </CardHeader>
              <CardBody className="space-y-3">
                {c.slots.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      {s.slotCode && (
                        <span className="font-mono text-xs text-fg-muted">{s.slotCode}</span>
                      )}
                      <Badge tone="brand">
                        выбрать {s.chooseN} из {s.options.length}
                      </Badge>
                      <Badge>{CYCLE_LABELS[s.cycle]}</Badge>
                      <Badge>{s.credits} кр · {s.totalHours} ч</Badge>
                      <Badge>{CONTROL_FORM_LABELS[s.controlForm]}</Badge>
                      {s.controlTerm != null && <Badge>{s.controlTerm} семестр</Badge>}
                      {s.isMinorSlot && <Badge tone="warning">минор</Badge>}
                    </div>
                    <ul className="space-y-1">
                      {s.options.map((d) => (
                        <li key={d.id} className="flex flex-wrap gap-x-2 text-sm">
                          <span className="font-mono text-xs text-fg-muted">{d.code}</span>
                          <span>{pickLocalized(d, 'name', locale)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
