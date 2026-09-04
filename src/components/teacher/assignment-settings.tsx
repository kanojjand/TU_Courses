'use client';

import { useEffect, useState, useTransition } from 'react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { updateAssignment } from '@/server/actions/assignments';
import { getAssignmentSettings } from '@/server/actions/question-queries';

/** F-T-10. Создание задания: срок, форматы, максимальный балл, штраф за просрочку. */
export function AssignmentSettings({ assignmentId }: { assignmentId: string }) {
  const [state, setState] = useState({
    instructions: '',
    dueAt: '',
    allowLate: true,
    latePenaltyPerDay: '10',
    latePenaltyMax: '50',
    maxScore: '100',
    allowedExtensions: 'pdf, docx, pptx, xlsx, zip',
    maxFileSizeMb: '20',
    maxFiles: '3',
  });
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const a = await getAssignmentSettings(assignmentId);
      setState({
        instructions: a.instructions ?? '',
        dueAt: a.dueAt ? a.dueAt.slice(0, 16) : '',
        allowLate: a.allowLate,
        latePenaltyPerDay: String(a.latePenaltyPerDay),
        latePenaltyMax: String(a.latePenaltyMax),
        maxScore: String(a.maxScore),
        allowedExtensions: a.allowedExtensions.join(', '),
        maxFileSizeMb: String(a.maxFileSizeMb),
        maxFiles: String(a.maxFiles),
      });
    })();
  }, [assignmentId]);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateAssignment({
        assignmentId,
        instructions: state.instructions,
        dueAt: state.dueAt ? new Date(state.dueAt).toISOString() : null,
        allowLate: state.allowLate,
        latePenaltyPerDay: Number(state.latePenaltyPerDay),
        latePenaltyMax: Number(state.latePenaltyMax),
        maxScore: Number(state.maxScore),
        allowedExtensions: state.allowedExtensions
          .split(',')
          .map((s) => s.trim().replace(/^\./, '').toLowerCase())
          .filter(Boolean),
        maxFileSizeMb: Number(state.maxFileSizeMb),
        maxFiles: Number(state.maxFiles),
      });
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Параметры задания</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {saved && <Alert tone="success">Параметры задания сохранены.</Alert>}

        <Field label="Формулировка задания">
          <Textarea
            rows={5}
            value={state.instructions}
            onChange={(e) => setState({ ...state, instructions: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Срок сдачи">
            <Input
              type="datetime-local"
              value={state.dueAt}
              onChange={(e) => setState({ ...state, dueAt: e.target.value })}
            />
          </Field>
          <Field label="Максимальный балл">
            <Input
              type="number"
              min="1"
              value={state.maxScore}
              onChange={(e) => setState({ ...state, maxScore: e.target.value })}
            />
          </Field>
          <Field label="Допустимые форматы" hint="Через запятую">
            <Input
              value={state.allowedExtensions}
              onChange={(e) => setState({ ...state, allowedExtensions: e.target.value })}
            />
          </Field>
          <Field label="Размер файла, МБ">
            <Input
              type="number"
              min="1"
              max="100"
              value={state.maxFileSizeMb}
              onChange={(e) => setState({ ...state, maxFileSizeMb: e.target.value })}
            />
          </Field>
          <Field label="Число файлов">
            <Input
              type="number"
              min="1"
              max="10"
              value={state.maxFiles}
              onChange={(e) => setState({ ...state, maxFiles: e.target.value })}
            />
          </Field>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Просрочка</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.allowLate}
              onChange={(e) => setState({ ...state, allowLate: e.target.checked })}
            />
            Принимать работы после срока
          </label>
          {state.allowLate && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Снижение за день, %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={state.latePenaltyPerDay}
                  onChange={(e) => setState({ ...state, latePenaltyPerDay: e.target.value })}
                />
              </Field>
              <Field label="Максимальное снижение, %">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={state.latePenaltyMax}
                  onChange={(e) => setState({ ...state, latePenaltyMax: e.target.value })}
                />
              </Field>
            </div>
          )}
        </fieldset>

        <Button onClick={save} disabled={pending}>
          {pending ? '…' : 'Сохранить параметры задания'}
        </Button>
      </CardBody>
    </Card>
  );
}
