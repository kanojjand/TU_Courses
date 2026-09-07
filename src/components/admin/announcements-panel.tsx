'use client';

import { useState, useTransition } from 'react';
import { Megaphone, Pin, Plus, ShieldAlert } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import { ANNOUNCEMENT_SCOPE_LABELS, type AnnouncementScopeCode } from '@/domain/chat';
import { saveAnnouncement, deleteAnnouncement } from '@/server/actions/chat';

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  isImportant: boolean;
  isPinned: boolean;
  isNormative: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  authorName: string;
  ackCount: number;
  targets: { scope: string; scopeId: string | null }[];
}

type OptionMap = Partial<Record<AnnouncementScopeCode, { id: string; label: string }[]>>;

/**
 * F-COM-05, F-COM-07, F-COM-08. Публикация объявлений с адресацией.
 *
 * Цели набираются списком: одно объявление адресуют и факультету,
 * и отдельной группе.
 */
export function AnnouncementsPanel({
  announcements,
  options,
  canMass,
  canNormative,
  canDelete,
}: {
  announcements: AnnouncementRow[];
  options: OptionMap;
  canMass: boolean;
  canNormative: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [targets, setTargets] = useState<{ scope: AnnouncementScopeCode; scopeId: string | null }[]>(
    []
  );
  const [scope, setScope] = useState<AnnouncementScopeCode>('GROUP');
  const [scopeId, setScopeId] = useState('');

  function run(action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setTargets([]);
      router.refresh();
    });
  }

  function addTarget() {
    if (scope !== 'UNIVERSITY' && !scopeId) {
      setError('Выберите объект области.');
      return;
    }
    const next = { scope, scopeId: scope === 'UNIVERSITY' ? null : scopeId };
    if (targets.some((t) => t.scope === next.scope && t.scopeId === next.scopeId)) return;
    setTargets((prev) => [...prev, next]);
    setScopeId('');
    setError(null);
  }

  const labelFor = (t: { scope: string; scopeId: string | null }) => {
    const scopeLabel = ANNOUNCEMENT_SCOPE_LABELS[t.scope as AnnouncementScopeCode] ?? t.scope;
    if (!t.scopeId) return scopeLabel;
    const list = options[t.scope as AnnouncementScopeCode] ?? [];
    const item = list.find((o) => o.id === t.scopeId);
    return `${scopeLabel}: ${item?.label ?? t.scopeId}`;
  };

  const scopeOptions = (Object.keys(ANNOUNCEMENT_SCOPE_LABELS) as AnnouncementScopeCode[]).filter(
    (s) => s !== 'COURSE' && (canMass || (s !== 'UNIVERSITY' && s !== 'FACULTY'))
  );

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Megaphone size={16} className="text-fg-muted" aria-hidden />
            Новое объявление
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            <Plus size={14} aria-hidden /> {open ? 'Скрыть' : 'Создать'}
          </Button>
        </CardHeader>

        {open && (
          <CardBody>
            <form
              action={(fd) => {
                if (targets.length === 0) {
                  setError('Укажите, кому адресовано объявление.');
                  return;
                }
                run(() =>
                  saveAnnouncement({
                    title: String(fd.get('title') ?? ''),
                    body: String(fd.get('body') ?? ''),
                    isImportant: fd.get('isImportant') === 'on',
                    isPinned: fd.get('isPinned') === 'on',
                    isNormative: fd.get('isNormative') === 'on',
                    publishedAt: String(fd.get('publishedAt') ?? '') || undefined,
                    expiresAt: String(fd.get('expiresAt') ?? '') || undefined,
                    targets: targets.map((t) => ({
                      scope: t.scope,
                      scopeId: t.scopeId ?? undefined,
                    })),
                  })
                );
              }}
              className="space-y-3"
            >
              <Field label="Заголовок" required>
                <Input name="title" required maxLength={300} />
              </Field>
              <Field label="Текст" required>
                <Textarea name="body" required rows={4} maxLength={10000} />
              </Field>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-fg">
                  Кому адресовано <span className="text-danger">*</span>
                </legend>
                {targets.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {targets.map((t, i) => (
                      <Badge key={i} tone="brand" className="flex items-center gap-1">
                        {labelFor(t)}
                        <button
                          type="button"
                          onClick={() => setTargets((prev) => prev.filter((_, j) => j !== i))}
                          className="rounded px-0.5 hover:text-danger"
                          aria-label="Убрать"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
                  <Select
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as AnnouncementScopeCode);
                      setScopeId('');
                    }}
                    aria-label="Область"
                  >
                    {scopeOptions.map((s) => (
                      <option key={s} value={s}>
                        {ANNOUNCEMENT_SCOPE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  {scope !== 'UNIVERSITY' ? (
                    <Select
                      value={scopeId}
                      onChange={(e) => setScopeId(e.target.value)}
                      aria-label="Объект"
                    >
                      <option value="">— выберите —</option>
                      {(options[scope] ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <p className="self-center text-sm text-fg-muted">
                      Объявление увидят все пользователи платформы
                    </p>
                  )}
                  <Button type="button" variant="outline" onClick={addTarget}>
                    Добавить
                  </Button>
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Опубликовать" hint="Пусто — сразу">
                  <Input name="publishedAt" type="datetime-local" />
                </Field>
                <Field label="Действует до">
                  <Input name="expiresAt" type="datetime-local" />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" name="isImportant" className="h-4 w-4 accent-brand" />
                  Требует подтверждения прочтения
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" name="isPinned" className="h-4 w-4 accent-brand" />
                  Закрепить сверху
                </label>
              </div>

              {canNormative && (
                <label className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <input
                    type="checkbox"
                    name="isNormative"
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>
                    <span className="font-medium">Нормативное объявление об аккредитации</span>
                    <span className="block text-xs text-fg-muted">
                      Показывается первым на всех страницах и не смещается вниз при появлении
                      новых объявлений (Типовые правила, п. 31).
                    </span>
                  </span>
                </label>
              )}

              {!canMass && (
                <p className="text-xs text-fg-muted">
                  Рассылка на весь университет и факультет доступна деканату и администратору.
                </p>
              )}

              <Button type="submit" disabled={pending}>
                Опубликовать
              </Button>
            </form>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Опубликованные ({announcements.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {announcements.length === 0 ? (
            <EmptyState
              title="Объявлений нет"
              description="Объявление адресуется университету, факультету, кафедре, программе, группе или дисциплине."
            />
          ) : (
            announcements.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-3 ${
                  a.isNormative ? 'border-warning bg-warning/5' : 'border-border'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {a.isNormative && (
                    <Badge tone="warning">
                      <ShieldAlert size={11} className="mr-1" aria-hidden />
                      нормативное
                    </Badge>
                  )}
                  {a.isPinned && (
                    <Badge tone="brand">
                      <Pin size={11} className="mr-1" aria-hidden />
                      закреплено
                    </Badge>
                  )}
                  {a.isImportant && <Badge tone="brand">важное · подтверждений {a.ackCount}</Badge>}
                  <span className="font-medium">{a.title}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-fg-muted">{a.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {a.targets.map((t, i) => (
                    <Badge key={i}>{labelFor(t)}</Badge>
                  ))}
                  <span className="ml-auto text-fg-muted">
                    {a.authorName} ·{' '}
                    {new Date(a.publishedAt ?? a.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteAnnouncement(a.id))}
                      className="rounded px-2 py-0.5 text-fg-muted hover:bg-danger/10 hover:text-danger"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
