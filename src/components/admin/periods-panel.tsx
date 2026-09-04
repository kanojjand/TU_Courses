'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Star } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import { createPeriod, setCurrentPeriod, setPeriodStatus } from '@/server/actions/admin';
import { fmtDate } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'запланирован',
  REGISTRATION: 'регистрация',
  ACTIVE: 'идёт обучение',
  EXAMS: 'сессия',
  CLOSED: 'закрыт',
};

export interface PeriodRow {
  id: string;
  name: string;
  yearName: string;
  type: string;
  ordinal: number;
  status: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  examStart: string;
  examEnd: string;
  courseCount: number;
}

export function PeriodsPanel({
  years,
  periods,
  locale,
}: {
  years: { id: string; name: string }[];
  periods: PeriodRow[];
  locale: string;
}) {
  const tc = useTranslations('common');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createPeriod({
          academicYearId: String(formData.get('academicYearId') ?? ''),
          name: String(formData.get('name') ?? ''),
          type: formData.get('type') as 'SEMESTER' | 'TRIMESTER' | 'SUMMER',
          ordinal: Number(formData.get('ordinal') ?? 1),
          startDate: String(formData.get('startDate') ?? ''),
          endDate: String(formData.get('endDate') ?? ''),
          registrationStart: String(formData.get('registrationStart') ?? ''),
          registrationEnd: String(formData.get('registrationEnd') ?? ''),
          examStart: String(formData.get('examStart') ?? ''),
          examEnd: String(formData.get('examEnd') ?? ''),
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : tc('error'));
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>Периоды ({periods.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} aria-hidden /> Добавить период
          </Button>
        </CardHeader>

        {adding && (
          <CardBody className="border-b border-border">
            <form action={submit} className="grid gap-3 sm:grid-cols-3">
              <Field label="Учебный год" required>
                <Select name="academicYearId" required>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Наименование" required>
                <Input name="name" required placeholder="1 семестр" />
              </Field>
              <Field label="Тип" required>
                <Select name="type" defaultValue="SEMESTER">
                  <option value="SEMESTER">Семестр</option>
                  <option value="TRIMESTER">Триместр</option>
                  <option value="SUMMER">Летний</option>
                </Select>
              </Field>
              <Field label="Порядковый номер" required>
                <Input name="ordinal" type="number" min="1" max="4" defaultValue="1" required />
              </Field>
              <Field label="Начало периода" required>
                <Input name="startDate" type="date" required />
              </Field>
              <Field label="Окончание периода" required>
                <Input name="endDate" type="date" required />
              </Field>
              <Field label="Регистрация с" required>
                <Input name="registrationStart" type="date" required />
              </Field>
              <Field label="Регистрация по" required>
                <Input name="registrationEnd" type="date" required />
              </Field>
              <Field label="Сессия с" required>
                <Input name="examStart" type="date" required />
              </Field>
              <Field label="Сессия по" required>
                <Input name="examEnd" type="date" required />
              </Field>
              <div className="sm:col-span-3">
                <Button type="submit" size="sm" disabled={pending}>{tc('create')}</Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {periods.length === 0 ? (
            <EmptyState title="Академические периоды не заданы" />
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Год</th>
                    <th>Период</th>
                    <th>Обучение</th>
                    <th>Регистрация</th>
                    <th>Сессия</th>
                    <th className="text-right">Курсов</th>
                    <th>Статус</th>
                    <th>{tc('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id}>
                      <td>{p.yearName}</td>
                      <td className="font-medium">
                        {p.name}
                        {p.isCurrent && (
                          <Badge tone="brand" className="ml-2">текущий</Badge>
                        )}
                      </td>
                      <td className="text-fg-muted">
                        {fmtDate(p.startDate, locale)} — {fmtDate(p.endDate, locale)}
                      </td>
                      <td className="text-fg-muted">
                        {fmtDate(p.registrationStart, locale)} — {fmtDate(p.registrationEnd, locale)}
                      </td>
                      <td className="text-fg-muted">
                        {fmtDate(p.examStart, locale)} — {fmtDate(p.examEnd, locale)}
                      </td>
                      <td className="text-right tabular-nums">{p.courseCount}</td>
                      <td>
                        <Select
                          className="h-7 text-xs"
                          value={p.status}
                          disabled={pending}
                          onChange={(e) =>
                            startTransition(async () => {
                              await setPeriodStatus(p.id, e.target.value as never);
                              window.location.reload();
                            })
                          }
                        >
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </Select>
                      </td>
                      <td>
                        {!p.isCurrent && (
                          <button
                            type="button"
                            title="Сделать текущим"
                            aria-label="Сделать текущим периодом"
                            className="p-1 text-fg-muted hover:text-brand"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await setCurrentPeriod(p.id);
                                window.location.reload();
                              })
                            }
                          >
                            <Star size={14} aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
