'use client';

import { useState, useTransition } from 'react';
import { Paperclip, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  attachSubmissionFile,
  requestSubmissionUpload,
  submitAssignment,
} from '@/server/actions/assignments';
import { fmtBytes, fmtDateTime } from '@/lib/utils';

export interface AssignmentSpec {
  id: string;
  instructions: string | null;
  dueAt: string | null;
  allowLate: boolean;
  maxScore: number;
  allowedExtensions: string[];
  maxFileSizeMb: number;
  maxFiles: number;
  latePenaltyPerDay: number;
  latePenaltyMax: number;
}

export interface SubmissionSpec {
  id: string;
  status: string;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  isLate: boolean;
  daysLate: number;
  files: { id: string; fileName: string; sizeBytes: number }[];
}

/** F-S-08. Сдача задания с загрузкой файла, просмотр комментария и балла. */
export function AssignmentPanel({
  assignment,
  submission,
  locale,
}: {
  assignment: AssignmentSpec;
  submission: SubmissionSpec | null;
  locale: string;
}) {
  const t = useTranslations('student');
  const [files, setFiles] = useState(submission?.files ?? []);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const graded = submission?.status === 'GRADED';
  const submitted = submission?.status === 'SUBMITTED' || graded;
  const returned = submission?.status === 'RETURNED';
  const overdue = assignment.dueAt ? new Date(assignment.dueAt) < new Date() : false;
  const locked = submitted && !returned;

  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    setUploading(true);

    try {
      for (const file of Array.from(fileList)) {
        if (files.length >= assignment.maxFiles) {
          throw new Error(`Можно приложить не более ${assignment.maxFiles} файлов.`);
        }

        // Прямая загрузка в объектное хранилище по подписанной ссылке
        const { signedUrl, storageKey } = await requestSubmissionUpload({
          assignmentId: assignment.id,
          fileName: file.name,
          sizeBytes: file.size,
        });

        const res = await fetch(signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!res.ok) throw new Error(`Не удалось загрузить «${file.name}».`);

        await attachSubmissionFile({
          assignmentId: assignment.id,
          storageKey,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        });

        setFiles((prev) => [
          ...prev,
          { id: storageKey, fileName: file.name, sizeBytes: file.size },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  function send(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await submitAssignment(assignment.id, String(formData.get('comment') ?? ''));
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка отправки');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Задание</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="brand">До {assignment.maxScore} баллов</Badge>
          {assignment.dueAt && (
            <Badge tone={overdue ? 'danger' : 'neutral'}>
              Срок: {fmtDateTime(assignment.dueAt, locale)}
            </Badge>
          )}
          {graded && <Badge tone="success">Проверено</Badge>}
          {returned && <Badge tone="warning">На доработке</Badge>}
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {assignment.instructions && (
          <div className="prose-lesson text-sm">
            <p className="whitespace-pre-line">{assignment.instructions}</p>
          </div>
        )}

        {overdue && assignment.allowLate && !submitted && (
          <Alert tone="warning">
            Срок сдачи истёк. Работа будет принята со снижением балла на{' '}
            {assignment.latePenaltyPerDay} % за каждый день просрочки, но не более{' '}
            {assignment.latePenaltyMax} %.
          </Alert>
        )}
        {overdue && !assignment.allowLate && !submitted && (
          <Alert tone="danger">Срок сдачи истёк, приём работ закрыт.</Alert>
        )}

        {error && <Alert tone="danger">{error}</Alert>}

        {graded && (
          <Alert tone={submission!.score! >= assignment.maxScore * 0.5 ? 'success' : 'warning'}>
            <p className="font-semibold">
              Балл: {submission!.score} из {assignment.maxScore}
              {submission!.isLate && ` (просрочка ${submission!.daysLate} дн.)`}
            </p>
            {submission!.feedback && (
              <p className="mt-1">
                {t('teacherComment')}: {submission!.feedback}
              </p>
            )}
          </Alert>
        )}

        {returned && submission?.feedback && (
          <Alert tone="warning" title={t('teacherComment')}>
            {submission.feedback}
          </Alert>
        )}

        {files.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <Paperclip size={14} className="shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                <span className="shrink-0 text-xs text-fg-muted">{fmtBytes(f.sizeBytes)}</span>
                {!locked && (
                  <button
                    type="button"
                    aria-label={`Убрать ${f.fileName}`}
                    className="shrink-0 text-fg-muted hover:text-danger"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !locked && (
            <EmptyState
              title="Файлы не приложены"
              description={`Разрешённые форматы: ${assignment.allowedExtensions.join(', ')}. До ${assignment.maxFileSizeMb} МБ, не более ${assignment.maxFiles} файлов.`}
            />
          )
        )}

        {!locked && (!overdue || assignment.allowLate) && (
          <form action={send} className="space-y-4">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-fg-muted hover:border-brand hover:text-fg">
              <Upload size={16} aria-hidden />
              {uploading ? 'Загрузка…' : 'Выберите файлы для загрузки'}
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={uploading || files.length >= assignment.maxFiles}
                accept={assignment.allowedExtensions.map((e) => `.${e}`).join(',')}
                onChange={(e) => upload(e.target.files)}
              />
            </label>

            <Field label="Комментарий к работе">
              <Textarea name="comment" rows={3} placeholder="Необязательно" />
            </Field>

            <Button type="submit" disabled={pending || uploading || files.length === 0}>
              {pending ? '…' : t('submitWork')}
            </Button>
          </form>
        )}

        {locked && !graded && (
          <Alert tone="success">
            {t('workSubmitted')} · {fmtDateTime(submission!.submittedAt, locale)}
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
