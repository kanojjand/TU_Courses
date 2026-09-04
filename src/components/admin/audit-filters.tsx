'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/routing';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Select, Field } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** F-A-07. Фильтры журнала аудита по пользователю, объекту и периоду. */
export function AuditFilters({ entityTypes }: { entityTypes: string[] }) {
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(formData: FormData) {
    const next = new URLSearchParams();
    for (const key of ['actor', 'entity', 'action', 'from', 'to']) {
      const value = String(formData.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <Card>
      <CardBody>
        <form action={apply} className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Пользователь">
            <Input name="actor" defaultValue={sp.get('actor') ?? ''} placeholder="e-mail" />
          </Field>
          <Field label="Объект">
            <Select name="entity" defaultValue={sp.get('entity') ?? ''}>
              <option value="">{tc('all')}</option>
              {entityTypes.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </Field>
          <Field label="Действие">
            <Input name="action" defaultValue={sp.get('action') ?? ''} placeholder="GRADE_UPDATE" />
          </Field>
          <Field label="С даты">
            <Input name="from" type="date" defaultValue={sp.get('from') ?? ''} />
          </Field>
          <Field label="По дату">
            <Input name="to" type="date" defaultValue={sp.get('to') ?? ''} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>{tc('filter')}</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => startTransition(() => router.replace(pathname))}
            >
              {tc('reset')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
