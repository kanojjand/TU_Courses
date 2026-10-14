import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCsv, buildXlsx } from '@/lib/xlsx-writer';

describe('выгрузка в Excel', () => {
  it('xlsx открывается как zip и содержит строки с казахскими буквами', () => {
    const data = buildXlsx([{ name: 'Тест', header: ['ФИО', 'Балл'], rows: [['Әбілқасымова Жансая', 95], ['<script>', null]] }]);
    const files = unzipSync(data);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('Әбілқасымова Жансая');
    expect(sheet).toContain('<v>95</v>');
    expect(sheet).toContain('&lt;script&gt;');
    expect(Object.keys(files)).toContain('xl/workbook.xml');
  });
  it('csv с BOM и экранированием', () => {
    const csv = buildCsv(['a', 'b'], [['x,y', 'say "hi"']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x,y","say ""hi"""');
  });
});
