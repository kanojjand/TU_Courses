'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { Select, Field } from '@/components/ui/input';

export function ReportFilters({
  periods,
  selected,
}: {
  periods: { id: string; label: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="max-w-md">
      <Field label="Академический период">
        <Select
          value={selected}
          disabled={pending}
          onChange={(e) => {
            const next = new URLSearchParams(sp.toString());
            next.set('periodId', e.target.value);
            startTransition(() => router.replace(`${pathname}?${next.toString()}`));
          }}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
