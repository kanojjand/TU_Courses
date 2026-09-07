'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';

import { Link, useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { CurriculumStatusBadge } from './status-badge';
import { createCurriculum } from '@/server/actions/curriculum';

export interface CurriculumRow {
  id: string;
  programCode: string;
  programName: string;
  admissionYear: number;
  version: number;
  studyForm: string;
  status: string;
  profileCode: string;
  requiredCredits: number;
  totalCredits: number;
  totalHours: number;
  slotCount: number;
  lastValidation: { isValid: boolean; runAt: string } | null;
}

const STUDY_FORM_LABELS: Record<string, string> = {
  FULL_TIME: 'очная',
  PART_TIME: 'заочная',
  DISTANCE: 'дистанционная',
  EVENING: 'вечерняя',
};

export function CurriculaList({
  curricula,
  programs,
  profiles,
  canEdit,
}: {
  curricula: CurriculumRow[];
  programs: { id: string; code: string; name: string; gosoProfileId: string | null }[];
  profiles: { id: string; code: string; nameRu: string; totalCredits: number }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Профиль ГОСО подставляется из карточки программы: у 6В01601 это
  // BACHELOR_240, и выбирать его вручную каждый раз незачем
  const [programId, setProgramId] = useState(programs[0]?.id ?? '');
  const selectedProgram = programs.find((p) => p.id === programId);
  const suggestedProfile = selectedProgram?.gosoProfileId ?? profiles[0]?.id ?? '';

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCurriculum({
        programId: String(formData.get('programId') ?? ''),
        gosoProfileId: String(formData.get('gosoProfileId') ?? ''),
        admissionYear: Number(formData.get('admissionYear') ?? 0),
        studyForm: formData.get('studyForm') as 'FULL_TIME',
        termsCount: Number(formData.get('termsCount') ?? 8),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data) router.push(`/admin/curricula/${result.data.id}`);
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {canEdit && (
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Новый учебный план</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} aria-hidden /> {adding ? 'Скрыть' : 'Создать план'}
            </Button>
          </CardHeader>
          {adding && (
            <CardBody>
              <form action={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Образовательная программа" required>
                  <Select
                    name="programId"
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    required
                  >
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Профиль ГОСО"
                  required
                  hint="Определяет нормативные объёмы, по которым работает валидатор"
                >
                  <Select name="gosoProfileId" key={suggestedProfile} defaultValue={suggestedProfile} required>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameRu}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Год набора" required>
                  <Input
                    name="admissionYear"
                    type="number"
                    min="2000"
                    max="2100"
                    defaultValue={new Date().getFullYear()}
                    required
                  />
                </Field>
                <Field label="Форма обучения" required>
                  <Select name="studyForm" defaultValue="FULL_TIME">
                    {Object.entries(STUDY_FORM_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Число академических периодов" required>
                  <Input name="termsCount" type="number" min="1" max="20" defaultValue="8" required />
                </Field>
                <div className="flex items-end">
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Создание…' : 'Создать'}
                  </Button>
                </div>
              </form>
            </CardBody>
          )}
        </Card>
      )}

      {curricula.length === 0 ? (
        <EmptyState
          title="Учебных планов нет"
          description="Создайте план для образовательной программы: он определяет, какие дисциплины и в каком объёме изучает студент."
        />
      ) : (
        <Card>
          <CardBody className="scroll-x p-0">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Программа</th>
                  <th>Набор</th>
                  <th>Версия</th>
                  <th>Форма</th>
                  <th>Профиль</th>
                  <th className="text-right">Позиций</th>
                  <th className="text-right">Кредитов</th>
                  <th className="text-right">Часов</th>
                  <th>Статус</th>
                  <th>Валидатор</th>
                </tr>
              </thead>
              <tbody>
                {curricula.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-normal">
                      <Link
                        href={`/admin/curricula/${c.id}`}
                        className="font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {c.programCode}
                      </Link>
                      <span className="block text-xs text-fg-muted">{c.programName}</span>
                    </td>
                    <td className="tabular-nums">{c.admissionYear}</td>
                    <td className="tabular-nums">в. {c.version}</td>
                    <td>{STUDY_FORM_LABELS[c.studyForm] ?? c.studyForm}</td>
                    <td className="text-xs">{c.profileCode}</td>
                    <td className="text-right tabular-nums">{c.slotCount}</td>
                    <td className="text-right tabular-nums">
                      <span className={c.totalCredits === c.requiredCredits ? '' : 'text-danger'}>
                        {c.totalCredits}
                      </span>
                      <span className="text-fg-muted"> / {c.requiredCredits}</span>
                    </td>
                    <td className="text-right tabular-nums">{c.totalHours}</td>
                    <td>
                      <CurriculumStatusBadge status={c.status} />
                    </td>
                    <td className="text-xs">
                      {c.lastValidation ? (
                        <span className={c.lastValidation.isValid ? 'text-success' : 'text-danger'}>
                          {c.lastValidation.isValid ? 'соответствует' : 'есть ошибки'}
                        </span>
                      ) : (
                        <span className="text-fg-muted">не запускался</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
