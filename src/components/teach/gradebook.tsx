'use client';

import { Lock, Pencil, Plus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import type { GradeComponent } from '@/db/schema';
import { cn } from '@/lib/utils';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';
import { createDefaultItemsAction, deleteGradeItemAction, saveGradeItemAction, setGradeAction } from '@/server/teach-actions';

export type GBItem = {
  id: string;
  component: GradeComponent;
  title: string;
  blockId: string | null;
  opensAt: string | null;
  dueAt: string | null;
  hardCloseAt: string | null;
  closed: boolean;
};
export type GBCell = { score: number; late: boolean; status: 'draft' | 'final' | 'sent' | 'confirmed' };
export type GBRow = {
  studentId: string;
  name: string;
  group: string;
  cells: Record<string, GBCell>;
  comps: Record<GradeComponent, number | null>;
  rating: number;
  admitted: boolean;
};
export type GBBlock = { id: string; type: string; title: string; lesson: string; week: number };

const COMPONENTS: GradeComponent[] = ['TK1', 'RK1', 'TK2', 'RK2', 'EXAM'];
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export function Gradebook({
  offeringId,
  items,
  rows,
  canEdit,
  blocks,
  fileName,
}: {
  offeringId: string;
  items: GBItem[];
  rows: GBRow[];
  canEdit: boolean;
  blocks: GBBlock[];
  fileName: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [data, setData] = useState(rows);
  const [editing, setEditing] = useState<{ row: string; item: string } | null>(null);
  const [value, setValue] = useState('');
  const [request, setRequest] = useState<{ row: GBRow; item: GBItem } | null>(null);
  const [itemDialog, setItemDialog] = useState<GBItem | 'new' | null>(null);
  const [pending, start] = useTransition();

  const ordered = COMPONENTS.flatMap((c) => items.filter((i) => i.component === c));

  function needsRequest(item: GBItem, cell?: GBCell) {
    return item.closed || cell?.status === 'sent' || cell?.status === 'confirmed';
  }

  function beginEdit(row: GBRow, item: GBItem) {
    if (!canEdit) return;
    if (needsRequest(item, row.cells[item.id])) {
      setRequest({ row, item });
      setValue(row.cells[item.id]?.score?.toString() ?? '');
      return;
    }
    setEditing({ row: row.studentId, item: item.id });
    setValue(row.cells[item.id]?.score?.toString() ?? '');
  }

  function commit(row: GBRow, item: GBItem, raw: string, reason?: string) {
    const trimmed = raw.trim().replace(',', '.');
    const score = trimmed === '' ? null : Number(trimmed);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      toast.error(t('teach.journal.invalidScore'));
      return;
    }
    if ((row.cells[item.id]?.score ?? null) === score && !reason) {
      setEditing(null);
      return;
    }
    start(async () => {
      const res = await setGradeAction(item.id, row.studentId, score, reason);
      if (res.status === 'saved') {
        setData((d) =>
          d.map((r) => {
            if (r.studentId !== row.studentId) return r;
            const cells = { ...r.cells };
            if (score === null) delete cells[item.id];
            else cells[item.id] = { score: res.score ?? score, late: res.late ?? false, status: 'draft' };
            return { ...r, cells };
          }),
        );
        router.refresh();
      } else if (res.status === 'request_created') {
        toast.success(t('teach.journal.requestSent'));
        setRequest(null);
      } else if (res.status === 'invalid' && reason !== undefined) {
        toast.error(t('teach.journal.reasonRequired'));
      } else {
        toast.error(t('common.somethingWrong'));
      }
      setEditing(null);
    });
  }

  function exportXlsx() {
    const header = [t('common.fullName'), t('common.group'), ...ordered.map((i) => `${t(`enums.component.${i.component}`)}: ${i.title}`), ...COMPONENTS.map((c) => t(`enums.component.${c}`)), t('teach.journal.ratingLong')];
    const body = data.map((r) => [r.name, r.group, ...ordered.map((i) => r.cells[i.id]?.score ?? null), ...COMPONENTS.map((c) => r.comps[c]), r.rating]);
    downloadBlob(buildXlsx([{ name: fileName, header, rows: body }]) as BlobPart, `${fileName}.xlsx`, XLSX_MIME);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canEdit && (
          <>
            <Button variant="secondary" onClick={() => setItemDialog('new')}>
              <Plus />
              {t('teach.journal.addItem')}
            </Button>
            {items.length === 0 && (
              <Button
                onClick={() =>
                  start(async () => {
                    await createDefaultItemsAction(offeringId);
                    router.refresh();
                  })
                }
                disabled={pending}
              >
                {t('teach.journal.createDefault')}
              </Button>
            )}
          </>
        )}
        <span className="text-sm text-fg-muted">{canEdit ? t('teach.journal.editHint') : ''}</span>
        <Button variant="secondary" className="ml-auto" onClick={exportXlsx}>
          {t('common.exportExcel')}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-fg-muted">{t('teach.journal.noItems')}</p>
      ) : (
        <div data-card className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-48 border-b border-r border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-fg-muted uppercase">
                  {t('common.student')}
                </th>
                {ordered.map((i) => (
                  <th key={i.id} className="min-w-24 border-b border-border bg-surface-2/70 px-2 py-2 text-center align-bottom">
                    <button
                      type="button"
                      onClick={() => canEdit && setItemDialog(i)}
                      className={cn('w-full text-center', canEdit && 'hover:text-brand')}
                      title={i.title}
                    >
                      <span className="block text-[0.6875rem] font-semibold text-fg-muted uppercase">{t(`enums.component.${i.component}`)}</span>
                      <span className="line-clamp-2 block text-xs font-medium">{i.title}</span>
                      {i.dueAt && <span className="block text-[0.6875rem] text-fg-muted">{format.dateTime(new Date(i.dueAt), { day: 'numeric', month: 'short' })}</span>}
                      <span className="mt-0.5 inline-flex gap-1">
                        {i.blockId && <Badge className="px-1.5 py-0 text-[0.625rem]">{t('teach.journal.auto')}</Badge>}
                        {i.closed && <Lock className="size-3 text-fg-muted" />}
                      </span>
                    </button>
                  </th>
                ))}
                {COMPONENTS.map((c) => (
                  <th key={c} className="border-b border-l border-border bg-surface-2 px-2 py-2 text-center text-xs font-semibold text-fg-muted uppercase">
                    {t(`enums.component.${c}`)}
                  </th>
                ))}
                <th className="border-b border-l border-border bg-surface-2 px-2 py-2 text-center text-xs font-semibold text-fg-muted uppercase" title={t('teach.journal.ratingLong')}>
                  {t('teach.journal.rating')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.studentId} className="hover:bg-surface-2/40">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-3 py-1.5">
                    <p className="leading-tight font-medium">{r.name}</p>
                    <p className="text-xs text-fg-muted">{r.group}</p>
                  </td>
                  {ordered.map((i) => {
                    const cell = r.cells[i.id];
                    const isEditing = editing?.row === r.studentId && editing.item === i.id;
                    return (
                      <td key={i.id} className="border-b border-border p-0 text-center">
                        {isEditing ? (
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={() => commit(r, i, value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commit(r, i, value);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            className="h-11 w-full bg-brand-soft text-center font-semibold outline-none"
                            aria-label={`${r.name}: ${i.title}`}
                          />
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit || pending}
                            onClick={() => beginEdit(r, i)}
                            className={cn(
                              'flex h-11 w-full items-center justify-center gap-1 tabular-nums',
                              canEdit && 'hover:bg-brand-soft',
                              cell?.late && 'text-danger',
                              cell?.status === 'confirmed' && 'bg-success-soft/50',
                            )}
                            title={cell?.late ? t('common.lateLong') : undefined}
                          >
                            {cell ? cell.score : <span className="text-fg-muted/50">·</span>}
                            {cell?.late && <span className="text-[0.6rem]">●</span>}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  {COMPONENTS.map((c) => (
                    <td key={c} className="border-b border-l border-border px-2 text-center font-medium tabular-nums">
                      {r.comps[c] ?? '—'}
                    </td>
                  ))}
                  <td className="border-b border-l border-border px-2 text-center">
                    <span className={cn('font-bold tabular-nums', r.admitted ? 'text-success' : 'text-warning')}>{r.rating}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!request} onOpenChange={(o) => !o && setRequest(null)}>
        {request && (
          <DialogContent title={t('teach.journal.requestTitle')} description={t('teach.journal.requestHint')}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const reason = String(fd.get('reason') ?? '').trim();
                if (!reason) {
                  toast.error(t('teach.journal.reasonRequired'));
                  return;
                }
                commit(request.row, request.item, String(fd.get('score') ?? ''), reason);
              }}
              className="space-y-4"
            >
              <p className="text-sm">
                <span className="font-medium">{request.row.name}</span> · {request.item.title}
              </p>
              <Field label={t('teach.journal.newScore')}>
                <Input name="score" defaultValue={value} inputMode="decimal" required />
              </Field>
              <Field label={t('common.reason')}>
                <Textarea name="reason" required maxLength={1000} />
              </Field>
              <Button type="submit" disabled={pending} className="w-full">
                {t('teach.journal.sendRequest')}
              </Button>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!itemDialog} onOpenChange={(o) => !o && setItemDialog(null)}>
        {itemDialog && (
          <DialogContent title={t('teach.journal.editItem')}>
            <ItemForm
              item={itemDialog === 'new' ? null : itemDialog}
              blocks={blocks}
              onSave={(input) =>
                start(async () => {
                  const res = await saveGradeItemAction(offeringId, itemDialog === 'new' ? null : itemDialog.id, input);
                  if ('error' in res) toast.error(t('common.somethingWrong'));
                  else {
                    toast.success(t('common.saved'));
                    setItemDialog(null);
                    router.refresh();
                  }
                })
              }
              onDelete={
                itemDialog === 'new'
                  ? undefined
                  : () => {
                      if (!window.confirm(t('teach.journal.deleteItemConfirm'))) return;
                      start(async () => {
                        const res = await deleteGradeItemAction(offeringId, itemDialog.id);
                        if ('error' in res) toast.error(t('common.somethingWrong'));
                        setItemDialog(null);
                        router.refresh();
                      });
                    }
              }
              pending={pending}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ItemForm({
  item,
  blocks,
  onSave,
  onDelete,
  pending,
}: {
  item: GBItem | null;
  blocks: GBBlock[];
  onSave: (input: { component: GradeComponent; title: string; blockId: string | null; opensAt: string | null; dueAt: string | null; hardCloseAt: string | null }) => void;
  onDelete?: () => void;
  pending: boolean;
}) {
  const t = useTranslations();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const iso = (k: string) => {
          const v = String(fd.get(k) ?? '');
          return v ? new Date(v).toISOString() : null;
        };
        onSave({
          component: String(fd.get('component')) as GradeComponent,
          title: String(fd.get('title') ?? ''),
          blockId: String(fd.get('blockId') ?? '') || null,
          opensAt: iso('opensAt'),
          dueAt: iso('dueAt'),
          hardCloseAt: iso('hardCloseAt'),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('teach.journal.component')}>
          <Select name="component" defaultValue={item?.component ?? 'TK1'}>
            {COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {t(`enums.componentLong.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('teach.journal.itemTitle')}>
          <Input name="title" defaultValue={item?.title ?? ''} required maxLength={200} />
        </Field>
      </div>
      <Field label={t('teach.journal.linkedBlock')}>
        <Select name="blockId" defaultValue={item?.blockId ?? ''}>
          <option value="">{t('teach.journal.noLink')}</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {t(`enums.blockType.${b.type as 'quiz'}`)} · {t('common.weekN', { n: b.week })} · {b.title}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('teach.journal.opensAt')}>
          <Input type="datetime-local" name="opensAt" defaultValue={toLocalInput(item?.opensAt ?? null)} />
        </Field>
        <Field label={t('teach.journal.dueAt')}>
          <Input type="datetime-local" name="dueAt" defaultValue={toLocalInput(item?.dueAt ?? null)} />
        </Field>
        <Field label={t('teach.journal.hardCloseAt')}>
          <Input type="datetime-local" name="hardCloseAt" defaultValue={toLocalInput(item?.hardCloseAt ?? null)} />
        </Field>
      </div>
      <p className="text-xs text-fg-muted">{t('teach.journal.hardCloseHint')}</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          <Pencil />
          {t('common.save')}
        </Button>
        {onDelete && (
          <Button type="button" variant="danger" onClick={onDelete} disabled={pending}>
            {t('common.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
