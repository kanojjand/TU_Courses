'use client';

import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx-writer';
import { Button } from './button';

export type DTColumn = {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Выпадающий фильтр по уникальным значениям колонки */
  filter?: boolean;
  /** Не выгружать в Excel (кнопки и т. п.) */
  noExport?: boolean;
  className?: string;
};

export type DTCell = { v: string | number | null; node?: React.ReactNode };
export type DTRow = { id: string; href?: string; tone?: 'danger' | 'warning' | 'success'; cells: Record<string, DTCell | string | number | null> };

function cellOf(row: DTRow, key: string): DTCell {
  const c = row.cells[key];
  if (c === null || c === undefined) return { v: null };
  if (typeof c === 'object' && 'v' in c) return c;
  return { v: c as string | number };
}

export function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Таблица для всех кабинетов: поиск, фильтры, сортировка, постраничный вывод
 * и выгрузка того, что отфильтровано, в Excel (требование раздела 8 ТЗ).
 */
export function DataTable({
  columns,
  rows,
  fileName = 'export',
  pageSize = 50,
  searchable = true,
  emptyText,
  toolbar,
  dense,
}: {
  columns: DTColumn[];
  rows: DTRow[];
  fileName?: string;
  pageSize?: number;
  searchable?: boolean;
  emptyText?: string;
  toolbar?: React.ReactNode;
  dense?: boolean;
}) {
  const t = useTranslations('common');
  const [q, setQ] = React.useState('');
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = React.useState(0);

  const filterOptions = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const col of columns.filter((c) => c.filter)) {
      const set = new Set<string>();
      rows.forEach((r) => {
        const v = cellOf(r, col.key).v;
        if (v !== null && v !== '') set.add(String(v));
      });
      out[col.key] = [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    return out;
  }, [columns, rows]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      for (const [k, v] of Object.entries(filters)) if (v && String(cellOf(r, k).v ?? '') !== v) return false;
      if (!needle) return true;
      return columns.some((c) => String(cellOf(r, c.key).v ?? '').toLowerCase().includes(needle));
    });
    if (sort) {
      list = [...list].sort((a, b) => {
        const av = cellOf(a, sort.key).v;
        const bv = cellOf(b, sort.key).v;
        if (av === bv) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv), 'ru', { numeric: true }) * sort.dir;
      });
    }
    return list;
  }, [rows, q, filters, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, (current + 1) * pageSize);

  function exportXlsx() {
    const cols = columns.filter((c) => !c.noExport);
    const data = buildXlsx([
      { name: fileName, header: cols.map((c) => c.header), rows: filtered.map((r) => cols.map((c) => cellOf(r, c.key).v)) },
    ]);
    downloadBlob(data as BlobPart, `${fileName}.xlsx`, XLSX_MIME);
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {searchable && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder={t('searchPlaceholder')}
              aria-label={t('search')}
              className="h-11 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-[0.9375rem] focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
          </div>
        )}
        {columns
          .filter((c) => c.filter)
          .map((c) => (
            <select
              key={c.key}
              aria-label={c.header}
              value={filters[c.key] ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, [c.key]: e.target.value }));
                setPage(0);
              }}
              className="h-11 max-w-[14rem] rounded-lg border border-border bg-surface px-3 text-[0.9375rem]"
            >
              <option value="">
                {c.header}: {t('all').toLowerCase()}
              </option>
              {filterOptions[c.key]?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {toolbar}
          <Button variant="secondary" onClick={exportXlsx} title={t('exportExcelHint')} disabled={filtered.length === 0}>
            <Download />
            {t('exportExcel')}
          </Button>
        </div>
      </div>
      <div data-card className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'border-b border-border bg-surface-2/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted whitespace-nowrap',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.noExport ? (
                      c.header
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 uppercase hover:text-fg"
                        onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                      >
                        {c.header}
                        {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center text-fg-muted">
                    {rows.length === 0 ? (emptyText ?? t('empty')) : t('nothingFound')}
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    'hover:bg-surface-2/50',
                    r.tone === 'danger' && 'bg-danger-soft/50',
                    r.tone === 'warning' && 'bg-warning-soft/50',
                    r.tone === 'success' && 'bg-success-soft/40',
                  )}
                >
                  {columns.map((c, ci) => {
                    const cell = cellOf(r, c.key);
                    const content = cell.node ?? (cell.v === null ? '—' : String(cell.v));
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          'border-b border-border px-3 align-middle',
                          dense ? 'py-1.5' : 'py-2.5',
                          c.align === 'right' && 'text-right tabular-nums',
                          c.align === 'center' && 'text-center',
                          c.className,
                        )}
                      >
                        {ci === 0 && r.href ? (
                          <Link href={r.href} className="font-medium text-fg hover:text-brand hover:underline">
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <span>{t('shown', { shown: visible.length, total: filtered.length })}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
              {t('previous')}
            </Button>
            <span>{t('pageOf', { page: current + 1, pages })}</span>
            <Button size="sm" variant="secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              {t('next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
