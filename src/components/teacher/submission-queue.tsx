'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Paperclip } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { gradeSubmission } from '@/server/actions/assignments';
import { fmtBytes, fmtDateTime } from '@/lib/utils';

export interface QueueItem {
  id: string;
  status: string;
  studentName: string;
  group: string;
  assignmentTitle: string;
  maxScore: number;
  submittedAt: string | null;
  isLate: boolean;
  daysLate: number;
  latePenaltyPerDay: number;
  latePenaltyMax: number;
  comment: string | null;
  rawScore: number | null;
  score: number | null;
  feedback: string | null;
  files: { id: string; fileName: string; sizeBytes: number }[];
}

/** F-T-11. Очередь проверки: просмотр файла, балл, комментарий, возврат. */
export function SubmissionQueue({
  submissions,
  locale,
}: {
  submissions: QueueItem[];
  locale: string;
}) {
  const t = useTranslations('teacher');
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'GRADED'>('SUBMITTED');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = submissions.filter((s) =>
    filter === 'ALL' ? true : filter === 'SUBMITTED' ? s.status === 'SUBMITTED' : s.status === 'GRADED'
  );

  function grade(id: string, formData: FormData, returnForRevision: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await gradeSubmission({
          submissionId: id,
          score: Number(formData.get('score') ?? 0),
          feedback: String(formData.get('feedback') ?? ''),
          returnForRevision,
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка');
      }
    });
  }

  const pendingCount = submissions.filter((s) => s.status === 'SUBMITTED').length;

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['SUBMITTED', `${t('ungraded')} (${pendingCount})`],
            ['GRADED', 'Проверенные'],
            ['ALL', 'Все'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'primary' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Работ в этой категории нет" />
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => (
            <li key={s.id}>
              <Card>
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{s.studentName}</CardTitle>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {s.group} · {s.assignmentTitle} · {fmtDateTime(s.submittedAt, locale)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.isLate && <Badge tone="warning">Просрочка {s.daysLate} дн.</Badge>}
                    {s.status === 'GRADED' && (
                      <Badge tone="success">
                        {s.score} / {s.maxScore}
                      </Badge>
                    )}
                    {s.status === 'RETURNED' && <Badge tone="warning">На доработке</Badge>}
                  </div>
                </CardHeader>

                <CardBody className="space-y-4">
                  {s.comment && (
                    <p className="text-sm text-fg-muted">
                      Комментарий обучающегося: {s.comment}
                    </p>
                  )}

                  <ul className="space-y-2 text-sm">
                    {s.files.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-2">
                        <Paperclip size={14} className="shrink-0 text-fg-muted" aria-hidden />
                        <a
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-brand hover:underline"
                        >
                          {f.fileName}
                        </a>
                        <span className="shrink-0 text-xs text-fg-muted">
                          {fmtBytes(f.sizeBytes)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {s.isLate && (
                    <Alert tone="warning">
                      Работа сдана с просрочкой {s.daysLate} дн. К выставленному баллу будет
                      применено снижение {Math.min(s.daysLate * s.latePenaltyPerDay, s.latePenaltyMax)} %
                      (не более {s.latePenaltyMax} %).
                    </Alert>
                  )}

                  <form
                    className="grid gap-3 sm:grid-cols-[140px_1fr_auto]"
                    action={(fd) => grade(s.id, fd, false)}
                  >
                    <Field label={`Балл (макс. ${s.maxScore})`} required>
                      <Input
                        name="score"
                        type="number"
                        min="0"
                        max={s.maxScore}
                        step="0.5"
                        defaultValue={s.rawScore ?? ''}
                        required
                      />
                    </Field>
                    <Field label={t('grade')}>
                      <Textarea name="feedback" rows={2} defaultValue={s.feedback ?? ''} />
                    </Field>
                    <div className="flex items-end gap-2">
                      <Button type="submit" size="sm" disabled={pending}>
                        {t('grade')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={(e) => {
                          const form = e.currentTarget.closest('form');
                          if (form) grade(s.id, new FormData(form), true);
                        }}
                      >
                        {t('returnForRevision')}
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
