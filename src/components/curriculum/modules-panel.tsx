'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { saveModule, deleteModule } from '@/server/actions/curriculum';

/**
 * F-CUR-02. Модули учебного плана («Модуль общественных наук» и т. п.).
 *
 * Удаление модуля не удаляет его позиции: они просто теряют группировку.
 * Иначе случайное удаление модуля стирало бы часть плана.
 */
export function ModulesPanel({
  curriculumId,
  modules,
  slotCountByModule,
  editable,
}: {
  curriculumId: string;
  modules: { id: string; code: string | null; nameKk: string; nameRu: string; sortOrder: number }[];
  slotCountByModule: Record<string, number>;
  editable: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveModule({
        curriculumId,
        code: String(formData.get('code') ?? '') || undefined,
        nameKk: String(formData.get('nameKk') ?? ''),
        nameRu: String(formData.get('nameRu') ?? ''),
        sortOrder: Number(formData.get('sortOrder') ?? 0),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-2">
        <CardTitle>Модули ({modules.length})</CardTitle>
        {editable && (
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} aria-hidden />
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-2">
        {error && <Alert tone="danger">{error}</Alert>}

        {adding && editable && (
          <form action={submit} className="space-y-2 rounded-lg border border-border p-3">
            <Field label="Шифр">
              <Input name="code" placeholder="MON" />
            </Field>
            <Field label="Наименование, каз." required>
              <Input name="nameKk" required />
            </Field>
            <Field label="Наименование, рус." required>
              <Input name="nameRu" required />
            </Field>
            <Field label="Порядок">
              <Input name="sortOrder" type="number" min="0" defaultValue={modules.length} />
            </Field>
            <Button type="submit" size="sm" disabled={pending}>
              Добавить
            </Button>
          </form>
        )}

        {modules.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Модулей нет. Позиции плана можно группировать по модулям, как в печатной форме.
          </p>
        ) : (
          <ul className="space-y-1">
            {modules.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {m.code && <span className="text-xs text-fg-muted">{m.code} · </span>}
                  {m.nameRu}
                  <span className="ml-1 text-xs text-fg-muted">
                    ({slotCountByModule[m.id] ?? 0})
                  </span>
                </span>
                {editable && (slotCountByModule[m.id] ?? 0) === 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteModule(curriculumId, m.id);
                        if (!result.ok) setError(result.error);
                        else router.refresh();
                      })
                    }
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-danger/10 hover:text-danger"
                  >
                    Удалить
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
