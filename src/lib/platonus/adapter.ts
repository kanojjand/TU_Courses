import 'server-only';
import type { ImportKind } from './formats';
import { SHEET_COLUMNS } from './formats';

/**
 * Транспорт обмена с Platonus (раздел 5.4 ТЗ).
 *
 * Код синхронизации (sync.ts) пишется один раз. Меняется только адаптер:
 *  - FileAdapter — сейчас: строки приходят из файла регистратора,
 *    ведомость уходит файлом Excel/CSV;
 *  - ApiAdapter — после переговоров: ночная синхронизация и отправка
 *    пакета оценок по REST API Platonus (/rest/...).
 */
export type GradeSheetRow = {
  platonusStudentId: string;
  fullName: string;
  groupCode: string;
  disciplineCode: string;
  stream: string;
  component: string;
  score: number;
  late: boolean;
  approvedBy: string;
};

export type SendResult = { ok: boolean; accepted: number; rejected: { platonusStudentId: string; message: string }[] };

export interface PlatonusAdapter {
  readonly method: 'file' | 'api';
  /** Записи справочника или контингента */
  fetch(kind: ImportKind): Promise<{ header: string[]; rows: Record<string, string>[] }>;
  /** Отправка ведомости. Файловый адаптер готовит файл, API — отправляет пакет. */
  sendGrades(rows: GradeSheetRow[]): Promise<SendResult>;
}

export class FileAdapter implements PlatonusAdapter {
  readonly method = 'file' as const;
  constructor(private readonly table: { header: string[]; rows: Record<string, string>[] }) {}

  async fetch() {
    return this.table;
  }

  /** При обмене файлами «отправка» = файл ведомости для регистратора; ответ Platonus отмечается вручную */
  async sendGrades(rows: GradeSheetRow[]): Promise<SendResult> {
    return { ok: true, accepted: rows.length, rejected: [] };
  }

  static sheetMatrix(rows: GradeSheetRow[]): { header: string[]; rows: (string | number)[][] } {
    return {
      header: [...SHEET_COLUMNS],
      rows: rows.map((r) => [
        r.platonusStudentId,
        r.fullName,
        r.groupCode,
        r.disciplineCode,
        r.stream,
        r.component,
        r.score,
        r.late ? 'yes' : 'no',
        r.approvedBy,
      ]),
    };
  }
}

export class PlatonusApiNotConfigured extends Error {
  constructor() {
    super('PLATONUS_API_NOT_CONFIGURED');
  }
}

/**
 * Заготовка под REST API Platonus. Методы и пути уточняются по официальной
 * документации, когда вуз получит доступ (открытый вопрос из раздела 10).
 */
export class ApiAdapter implements PlatonusAdapter {
  readonly method = 'api' as const;
  constructor(
    private readonly baseUrl = process.env.PLATONUS_API_URL,
    private readonly token = process.env.PLATONUS_API_TOKEN,
  ) {}

  private ensure() {
    if (!this.baseUrl || !this.token) throw new PlatonusApiNotConfigured();
  }

  async fetch(kind: ImportKind): Promise<{ header: string[]; rows: Record<string, string>[] }> {
    this.ensure();
    const res = await fetch(`${this.baseUrl}/rest/lms/${kind}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Platonus API ${res.status}`);
    const rows = (await res.json()) as Record<string, string>[];
    return { header: rows[0] ? Object.keys(rows[0]) : [], rows };
  }

  async sendGrades(rows: GradeSheetRow[]): Promise<SendResult> {
    this.ensure();
    const res = await fetch(`${this.baseUrl}/rest/lms/grades`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Platonus API ${res.status}`);
    return (await res.json()) as SendResult;
  }
}

export function platonusApiConfigured() {
  return !!process.env.PLATONUS_API_URL && !!process.env.PLATONUS_API_TOKEN;
}
