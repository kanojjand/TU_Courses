import type { ComplianceRow, GosoTotals } from '@/domain/goso';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * F-CUR-07. Панель соответствия: «требуется по ГОСО / есть в плане / отклонение»
 * по каждому циклу и компоненту.
 *
 * Столбик показывает долю набранного от норматива и обрезается на 100 %:
 * перебор виден по числу отклонения, а растянутая полоса ломала бы сравнение
 * строк между собой.
 */
export function CompliancePanel({
  compliance,
  totals,
}: {
  compliance: ComplianceRow[];
  totals: GosoTotals;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Соответствие ГОСО</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {compliance.map((row) => {
          const share = row.required > 0 ? Math.min(row.actual / row.required, 1) : 0;
          const unit = row.unit === 'hours' ? 'ч' : 'кр';
          return (
            <div key={row.rule}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="font-medium text-fg">
                  <span className="mr-2 text-xs font-normal text-fg-muted">{row.rule}</span>
                  {row.label}
                </span>
                <span className="tabular-nums">
                  <span className={row.ok ? 'text-fg' : 'text-danger font-semibold'}>
                    {row.actual}
                  </span>
                  <span className="text-fg-muted">
                    {' / '}
                    {row.isMinimum ? '≥ ' : ''}
                    {row.required} {unit}
                  </span>
                  {row.delta !== 0 && (
                    <span className={row.ok ? 'ml-2 text-fg-muted' : 'ml-2 text-danger'}>
                      {row.delta > 0 ? '+' : ''}
                      {row.delta}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className={`h-full rounded-full ${row.ok ? 'bg-success' : 'bg-danger'}`}
                  style={{ width: `${share * 100}%` }}
                />
              </div>
            </div>
          );
        })}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-4">
          <Stat label="Практика" value={`${totals.practice} кр`} />
          <Stat label="Минор" value={`${totals.minor} кр`} />
          <Stat label="ДВО" value={`${totals.dvo} кр`} />
          <Stat label="Итого часов" value={String(totals.hours)} />
        </dl>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Кредиты по семестрам
          </p>
          <div className="scroll-x">
            <table className="table-dense w-auto min-w-full">
              <thead>
                <tr>
                  {Object.keys(totals.byTerm)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((t) => (
                      <th key={t} className="text-center">
                        {t}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Object.keys(totals.byTerm)
                    .map(Number)
                    .sort((a, b) => a - b)
                    .map((t) => (
                      <td key={t} className="text-center tabular-nums">
                        {totals.byTerm[t]}
                      </td>
                    ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}
