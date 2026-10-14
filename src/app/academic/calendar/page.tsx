import { asc, desc } from 'drizzle-orm';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AddPeriodForm, AddWindowForm, AddYearForm, DeleteWindow } from '@/components/reports/calendar-forms';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader, Section } from '@/components/ui/page';
import { Table, Td, Th } from '@/components/ui/table';
import { db } from '@/db';
import { academicPeriods, academicYears, calendarWindows } from '@/db/schema';

export default async function CalendarPage() {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const [years, periods, windows] = await Promise.all([
    db.select().from(academicYears).orderBy(desc(academicYears.startsOn)),
    db.select().from(academicPeriods).orderBy(desc(academicPeriods.startsOn)),
    db.select().from(calendarWindows).orderBy(asc(calendarWindows.startsAt)),
  ]);
  const d = (x: Date | string) => format.dateTime(new Date(x), { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t('reports.academic.calendar')} />
      <Section title={t('reports.academic.years')}>
        <Card className="mb-3 p-4">
          <AddYearForm />
        </Card>
        <Card className="mb-3 p-4">
          <AddPeriodForm years={years.map((y) => ({ id: y.id, title: y.title }))} />
        </Card>
        <div data-card className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table>
            <thead>
              <tr>
                <Th>{t('reports.academic.periodCode')}</Th>
                <Th>{t('reports.academic.startsOn')}</Th>
                <Th>{t('reports.academic.endsOn')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono font-medium">{p.code}</Td>
                  <Td>{d(p.startsOn)}</Td>
                  <Td>{d(p.endsOn)}</Td>
                  <Td>{p.isCurrent && <Badge tone="success">{t('reports.academic.current')}</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>
      <Section title={t('reports.academic.windows')}>
        <p className="mb-3 text-sm text-fg-muted">{t('reports.academic.windowsHint')}</p>
        <Card className="mb-3 p-4">
          <AddWindowForm periods={periods.map((p) => ({ id: p.id, code: p.code }))} />
        </Card>
        <div data-card className="overflow-hidden rounded-xl border border-border bg-surface">
          <Table>
            <thead>
              <tr>
                <Th>{t('common.period')}</Th>
                <Th>{t('reports.academic.kind')}</Th>
                <Th>{t('reports.academic.studyForm')}</Th>
                <Th>{t('reports.academic.startsOn')}</Th>
                <Th>{t('reports.academic.endsOn')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <Td className="font-mono">{periods.find((p) => p.id === w.periodId)?.code}</Td>
                  <Td className="font-medium">{t(`enums.windowKind.${w.kind}`)}</Td>
                  <Td>{w.studyForm ? t(`enums.studyForm.${w.studyForm}`) : t('reports.academic.allForms')}</Td>
                  <Td>{d(w.startsAt)}</Td>
                  <Td>{d(w.endsAt)}</Td>
                  <Td className="text-right">
                    <DeleteWindow id={w.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
