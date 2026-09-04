import 'server-only';
import type {
  PlatonusClient,
  PlatonusDepartment,
  PlatonusDiscipline,
  PlatonusPeriod,
  PlatonusProgram,
  PlatonusRegistration,
  PlatonusStudent,
  PlatonusTeacher,
  OutgoingAttendance,
  OutgoingCurrentControl,
  OutgoingFinalGrade,
  OutgoingMidterm,
} from './types';

/**
 * Клиент API Platonus.
 *
 * ЕДИНСТВЕННЫЙ ФАЙЛ, требующий правки после получения документации вендора
 * (раздел 9.4 ТЗ). Всё преобразование форматов сосредоточено здесь.
 *
 * До получения доступа PLATONUS_ENABLED=false, и система работает в файловом
 * режиме обмена (раздел 9.3) — он реализуется в рамках этапа 1 и является
 * обязательным.
 */

class DisabledPlatonusClient implements PlatonusClient {
  readonly mode = 'disabled' as const;

  private stop(): never {
    throw new Error(
      'Программный доступ к АИС Platonus не настроен (PLATONUS_ENABLED=false). ' +
        'Используйте файловый обмен: /admin/integrations.'
    );
  }

  fetchDepartments(): Promise<PlatonusDepartment[]> { this.stop(); }
  fetchPrograms(): Promise<PlatonusProgram[]> { this.stop(); }
  fetchDisciplines(): Promise<PlatonusDiscipline[]> { this.stop(); }
  fetchTeachers(): Promise<PlatonusTeacher[]> { this.stop(); }
  fetchStudents(): Promise<PlatonusStudent[]> { this.stop(); }
  fetchRegistrations(): Promise<PlatonusRegistration[]> { this.stop(); }
  fetchPeriods(): Promise<PlatonusPeriod[]> { this.stop(); }
  pushCurrentControl(): Promise<void> { this.stop(); }
  pushMidterms(): Promise<void> { this.stop(); }
  pushFinalGrades(): Promise<void> { this.stop(); }
  pushAttendance(): Promise<void> { this.stop(); }
}

class HttpPlatonusClient implements PlatonusClient {
  readonly mode = 'http' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...init?.headers,
      },
      // Ограничение частоты обращений уточняется у вендора (раздел 9.4)
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Platonus ${response.status} ${path}: ${body.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  }

  // ── Входящие данные (Platonus → Платформа) ────────────────────────────────
  // Пути и структуры ответов подлежат уточнению по документации вендора.

  fetchDepartments() {
    return this.request<PlatonusDepartment[]>('/api/v1/departments');
  }
  fetchPrograms() {
    return this.request<PlatonusProgram[]>('/api/v1/education-programs');
  }
  fetchDisciplines() {
    return this.request<PlatonusDiscipline[]>('/api/v1/disciplines');
  }
  fetchTeachers() {
    return this.request<PlatonusTeacher[]>('/api/v1/teachers');
  }
  fetchStudents(since?: Date) {
    const q = since ? `?updatedSince=${since.toISOString()}` : '';
    return this.request<PlatonusStudent[]>(`/api/v1/students${q}`);
  }
  fetchRegistrations(periodExternalId: string) {
    return this.request<PlatonusRegistration[]>(
      `/api/v1/registrations?period=${encodeURIComponent(periodExternalId)}`
    );
  }
  fetchPeriods() {
    return this.request<PlatonusPeriod[]>('/api/v1/academic-periods');
  }

  // ── Исходящие данные (Платформа → Platonus) ───────────────────────────────

  async pushCurrentControl(payload: OutgoingCurrentControl[]) {
    await this.request('/api/v1/grades/current-control', {
      method: 'POST',
      body: JSON.stringify({ items: payload }),
    });
  }
  async pushMidterms(payload: OutgoingMidterm[]) {
    await this.request('/api/v1/grades/midterms', {
      method: 'POST',
      body: JSON.stringify({ items: payload }),
    });
  }
  async pushFinalGrades(payload: OutgoingFinalGrade[]) {
    await this.request('/api/v1/grades/final', {
      method: 'POST',
      body: JSON.stringify({ items: payload }),
    });
  }
  async pushAttendance(payload: OutgoingAttendance[]) {
    await this.request('/api/v1/attendance', {
      method: 'POST',
      body: JSON.stringify({ items: payload }),
    });
  }
}

let cached: PlatonusClient | null = null;

export function getPlatonusClient(): PlatonusClient {
  if (cached) return cached;

  const enabled = process.env.PLATONUS_ENABLED === 'true';
  const baseUrl = process.env.PLATONUS_BASE_URL;
  const token = process.env.PLATONUS_API_TOKEN;

  cached =
    enabled && baseUrl && token
      ? new HttpPlatonusClient(baseUrl, token)
      : new DisabledPlatonusClient();

  return cached;
}

export function isPlatonusEnabled(): boolean {
  return getPlatonusClient().mode === 'http';
}
