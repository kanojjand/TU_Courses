'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Paperclip, Upload } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
// Редактор нужен только для текстовой лекции — грузим его отдельным
// файлом, чтобы конструктор курса открывался без веса tiptap
const RichEditor = dynamic(() => import('./rich-editor').then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" />,
});
import { QuizSettings } from './quiz-settings';
import { AssignmentSettings } from './assignment-settings';
import { updateContentItem } from '@/server/actions/course-builder';
import { attachMaterial } from '@/server/actions/materials';
import type { BuilderItem } from './course-builder';
import { fmtBytes } from '@/lib/utils';

/** F-T-05, F-T-06, F-T-07. Редактирование элемента содержания. */
export function ItemEditor({
  courseId,
  item,
  onClose,
}: {
  courseId: string;
  item: BuilderItem;
  onClose: () => void;
}) {
  const t = useTranslations('teacher');
  const tc = useTranslations('common');

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [hours, setHours] = useState(String(item.plannedAcademicHours));
  const [workType, setWorkType] = useState(item.workType);
  const [html, setHtml] = useState(item.contentHtml ?? '');
  const [url, setUrl] = useState(item.externalUrl ?? '');
  const [threshold, setThreshold] = useState(String(item.completionThreshold));
  const [files, setFiles] = useState(item.attachments);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateContentItem({
          itemId: item.id,
          title,
          description,
          plannedAcademicHours: Number(hours),
          workType: workType as 'LECTURE' | 'PRACTICE' | 'LAB' | 'SROP' | 'SRO',
          contentHtml: item.type === 'TEXT' ? html : undefined,
          externalUrl: url || undefined,
          completionThreshold: Number(threshold),
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : tc('error'));
      }
    });
  }

  /** F-T-04. Прямая загрузка в объектное хранилище по подписанной ссылке. */
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(list)) {
        const signRes = await fetch('/api/upload/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentItemId: item.id,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          }),
        });

        const signed = await signRes.json();
        if (!signRes.ok) throw new Error(signed.error ?? 'Не удалось получить ссылку на загрузку');

        const put = await fetch(signed.signedUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!put.ok) throw new Error(`Не удалось загрузить «${file.name}»`);

        const attachment = await attachMaterial({
          contentItemId: item.id,
          storageKey: signed.storageKey,
          bucket: signed.bucket,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        });

        setFiles((prev) => [
          ...prev,
          { id: attachment, fileName: file.name, sizeBytes: file.size },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={15} aria-hidden /> К структуре курса
      </button>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">{tc('saved')}</Alert>}

      <Card>
        <CardHeader><CardTitle>Общие параметры</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </Field>
            <Field label={t('workType')} required>
              <Select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                <option value="LECTURE">Лекция</option>
                <option value="PRACTICE">Практическое занятие</option>
                <option value="LAB">Лабораторное занятие</option>
                <option value="SROP">СРОП</option>
                <option value="SRO">СРО</option>
              </Select>
            </Field>
            <Field
              label={t('plannedHours')}
              hint="Академических часов. Сумма по курсу должна равняться кредитам × 30."
              required
            >
              <Input
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            <Field
              label="Порог завершения, %"
              hint="Доля просмотра/проработки для засчитывания элемента"
            >
              <Input
                type="number"
                min="1"
                max="100"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Краткое описание">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          {(item.type === 'VIDEO' || item.type === 'LINK') && (
            <Field
              label="Ссылка"
              hint={
                item.type === 'VIDEO'
                  ? 'YouTube или Vimeo. Учёт ведётся по фактически просмотренной доле.'
                  : 'Адрес внешнего ресурса'
              }
              required
            >
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
          )}
        </CardBody>
      </Card>

      {item.type === 'TEXT' && (
        <Card>
          <CardHeader><CardTitle>Текст лекции</CardTitle></CardHeader>
          <CardBody>
            <RichEditor value={html} onChange={setHtml} />
          </CardBody>
        </Card>
      )}

      {(item.type === 'FILE' || item.type === 'TEXT') && (
        <Card>
          <CardHeader><CardTitle>Файлы</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {files.length > 0 && (
              <ul className="space-y-2 text-sm">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <Paperclip size={14} className="shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
                    <span className="shrink-0 text-xs text-fg-muted">{fmtBytes(f.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-fg-muted hover:border-brand hover:text-fg">
              <Upload size={16} aria-hidden />
              {uploading ? 'Загрузка…' : 'PDF, DOCX, PPTX, XLSX, изображения — до 100 МБ'}
              <input
                type="file"
                multiple
                className="sr-only"
                disabled={uploading}
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.svg,.txt"
                onChange={(e) => upload(e.target.files)}
              />
            </label>
          </CardBody>
        </Card>
      )}

      {item.type === 'QUIZ' && item.quizId && (
        <QuizSettings courseId={courseId} quizId={item.quizId} />
      )}

      {item.type === 'ASSIGNMENT' && item.assignmentId && (
        <AssignmentSettings assignmentId={item.assignmentId} />
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? '…' : tc('save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {tc('back')}
        </Button>
      </div>
    </div>
  );
}
