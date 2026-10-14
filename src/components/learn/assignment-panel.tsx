'use client';

import { FileText, Paperclip, Send, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { MAX_UPLOAD_BYTES, uploadFile } from '@/lib/upload-client';
import { formatBytes } from '@/lib/utils';
import { submitAssignment } from '@/server/learn-actions';

type Existing = {
  submittedAt: string;
  text: string | null;
  files: { id: string; name: string; size: number }[];
  score: number | null;
  feedback: string | null;
  isLate: boolean;
} | null;

export function AssignmentPanel({
  offeringId,
  blockId,
  allowedExt,
  maxFiles,
  existing,
  allowed,
  late,
}: {
  offeringId: string;
  blockId: string;
  allowedExt: string[];
  maxFiles: number;
  existing: Existing;
  allowed: boolean;
  late: boolean;
}) {
  const t = useTranslations('learn.assignment');
  const tc = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const [text, setText] = useState(existing?.text ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [keep, setKeep] = useState(existing?.files ?? []);
  const [editing, setEditing] = useState(!existing);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const graded = existing?.score !== null && existing?.score !== undefined;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (allowedExt.length && !allowedExt.includes(ext)) {
        toast.error(`${f.name}: ${t('badExt')}`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name}: ${t('tooBig', { size: formatBytes(MAX_UPLOAD_BYTES) })}`);
        continue;
      }
      if (next.length + keep.length < maxFiles) next.push(f);
    }
    setFiles(next);
    if (input.current) input.current.value = '';
  }

  function submit() {
    if (!text.trim() && files.length === 0 && keep.length === 0) {
      toast.error(t('needSomething'));
      return;
    }
    start(async () => {
      try {
        const ids = keep.map((k) => k.id);
        for (const [i, f] of files.entries()) {
          setProgress(Math.round((i / files.length) * 100));
          const up = await uploadFile(f, { prefix: 'submissions', onProgress: (p) => setProgress(Math.round(((i + p / 100) / files.length) * 100)) });
          ids.push(up.id);
        }
        setProgress(null);
        const res = await submitAssignment(offeringId, blockId, ids, text);
        if ('error' in res) {
          toast.error(res.error === 'closed' ? t('closed') : res.error === 'needSomething' ? t('needSomething') : tc('somethingWrong'));
          return;
        }
        toast.success(t('sent'));
        setFiles([]);
        setEditing(false);
        router.refresh();
      } catch {
        setProgress(null);
        toast.error(tc('somethingWrong'));
      }
    });
  }

  return (
    <div className="space-y-3">
      {existing && !editing && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="font-semibold">{t('yourWork')}</p>
            {graded ? <Badge tone="success">{t('graded')}</Badge> : <Badge tone="warning">{t('waiting')}</Badge>}
            {existing.isLate && <Badge tone="danger">{tc('late')}</Badge>}
            <span className="text-xs text-fg-muted">{t('submitted', { date: format.dateTime(new Date(existing.submittedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</span>
          </div>
          {existing.text && <p className="text-sm whitespace-pre-wrap">{existing.text}</p>}
          {existing.files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {existing.files.map((f) => (
                <li key={f.id}>
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-brand hover:underline">
                    <FileText className="size-4" />
                    {f.name} <span className="text-fg-muted">({formatBytes(f.size)})</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {graded && (
            <div className="mt-3 rounded-lg border border-success/25 bg-success-soft p-3">
              <p className="text-2xl font-bold text-success">{existing.score}</p>
              {existing.feedback && (
                <p className="mt-1 text-sm">
                  <span className="font-medium">{t('feedback')}: </span>
                  {existing.feedback}
                </p>
              )}
            </div>
          )}
          {!graded && allowed && (
            <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
              {t('resubmit')}
            </Button>
          )}
        </div>
      )}

      {editing && allowed && (
        <div className="space-y-3">
          {late && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">{t('lateWarning')}</p>}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('comment')} aria-label={t('comment')} maxLength={4000} />
          <div>
            <input ref={input} type="file" multiple className="sr-only" id={`f-${blockId}`} onChange={(e) => addFiles(e.target.files)} accept={allowedExt.map((e) => `.${e}`).join(',')} />
            <label htmlFor={`f-${blockId}`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 text-[0.9375rem] font-medium hover:border-brand hover:text-brand">
              <Paperclip className="size-4" />
              {t('attach')}
            </label>
            <p className="mt-1 text-xs text-fg-muted">{t('allowed', { ext: allowedExt.join(', ') })}</p>
          </div>
          {(keep.length > 0 || files.length > 0) && (
            <ul className="space-y-1.5">
              {keep.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <FileText className="size-4 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button type="button" onClick={() => setKeep(keep.filter((k) => k.id !== f.id))} aria-label={tc('delete')} className="text-fg-muted hover:text-danger">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <FileText className="size-4 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-fg-muted">{formatBytes(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label={tc('delete')} className="text-fg-muted hover:text-danger">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} disabled={pending} size="lg">
              <Send />
              {existing ? t('resubmit') : t('submit')}
            </Button>
            {existing && (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                {tc('cancel')}
              </Button>
            )}
            {progress !== null && <span className="text-sm text-fg-muted">{t('uploading')} {progress}%</span>}
          </div>
        </div>
      )}
    </div>
  );
}
