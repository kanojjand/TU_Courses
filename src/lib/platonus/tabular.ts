import 'server-only';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { normHeader } from './formats';

export type Table = { header: string[]; rows: Record<string, string>[]; sheet?: string };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('hyperlink' in v) return String((v as { hyperlink: string }).hyperlink);
    return '';
  }
  return String(v);
}

function fromMatrix(matrix: string[][], sheet?: string): Table {
  const nonEmpty = matrix.filter((r) => r.some((c) => c && c.trim() !== ''));
  if (nonEmpty.length === 0) return { header: [], rows: [], sheet };
  const header = nonEmpty[0].map((h) => normHeader(h ?? ''));
  const rows = nonEmpty.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? '').toString().trim();
    });
    return o;
  });
  return { header: header.filter(Boolean), rows, sheet };
}

/** Читает CSV (запятая, точка с запятой или табуляция) или XLSX — все листы */
export async function readTables(fileName: string, data: Buffer): Promise<Table[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const out: Table[] = [];
    wb.eachSheet((ws) => {
      const matrix: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          vals[col - 1] = cellText(cell.value).trim();
        });
        matrix.push(Array.from(vals, (v) => v ?? ''));
      });
      out.push(fromMatrix(matrix, ws.name));
    });
    return out;
  }
  if (lower.endsWith('.xls')) throw new Error('XLS_NOT_SUPPORTED');
  const text = new TextDecoder('utf-8').decode(data).replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimiter: '' });
  return [fromMatrix(parsed.data as string[][])];
}
