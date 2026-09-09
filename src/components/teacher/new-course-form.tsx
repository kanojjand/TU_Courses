'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { createOwnCourse } from '@/server/actions/course-builder';

export interface DisciplineOption {
  id: string;
  label: string;
  credits: number;
}

export interface PeriodOption {
  id: string;
  label: string;
}

/**
 * F-T-01. Преподаватель заводит реализацию своей дисциплины сам.
 *
 * Курс создаётся черновиком: публикация по-прежнему через согласование
 * методистом, запись обучающихся — через ИУП и офис Регистратора.
 */
export function NewCourseForm({
  disciplines,
  periods,
}: {
  disciplines: DisciplineOption[];
  periods: PeriodOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const blocked = disciplines.length === 0 || periods.length === 0;

  return (
    <div className="mt-6">
      <Button variant="outline" onClick={() => setOpen((v) => !v)} disabled={blocked}>
        <Plus size={15} aria-hidden /> {open ? 'Скрыть' : 'Создать курс'}
      </Button>

      {blocked && (
        <p className="mt-2 text-sm text-fg-muted">
          {periods.length === 0
            ? 'Академические периоды не заведены — обратитесь в офис Регистратора.'
            : 'В справочнике нет активных дисциплин.'}
        </p>
      )}

      {open && !blocked && (
        <Card className="mt-3">
          <CardBody>
            {error && (
              <Alert tone="danger" className="mb-4">
                {error}
              </Alert>
            )}

            <form
              action={(fd) => {
                setError(null);
                startTransition(async () => {
                  const result = await createOwnCourse({
                    disciplineId: String(fd.get('disciplineId') ?? ''),
                    periodId: String(fd.get('periodId') ?? ''),
                    streamName: String(fd.get('streamName') ?? '') || undefined,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.push(`/teach/courses/${result.data.id}/builder`);
                });
              }}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_auto]"
            >
              <Field label="Дисциплина" required>
                <Select name="disciplineId" required defaultValue="">
                  <option value="" disabled>
                    — выберите —
                  </option>
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Академический период" required>
                <Select name="periodId" required defaultValue={periods[0]?.id ?? ''}>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Поток" hint="Только если дисциплина идёт параллельно">
                <Input name="streamName" maxLength={50} placeholder="напр. поток Б" />
              </Field>

              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Создать
                </Button>
              </div>
            </form>

            <p className="mt-4 max-w-prose text-xs text-fg-muted">
              Курс создаётся черновиком, и вы становитесь ведущим преподавателем.
              Наполнение — ваше; публикация по-прежнему требует согласования
              методистом, а запись обучающихся идёт через индивидуальные учебные
              планы и офис Регистратора. На дисциплину в периоде заводится один
              курс: если он уже есть и вы на нём назначены, вас откроет в нём.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
