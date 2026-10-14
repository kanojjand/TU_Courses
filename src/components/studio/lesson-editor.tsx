'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClipboardCheck, FileText, GripVertical, Link2, ListChecks, Loader2, Trash2, Type, Upload, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import type { BlockType, MediaStatus } from '@/db/schema';
import { MAX_UPLOAD_BYTES, uploadFile } from '@/lib/upload-client';
import { cn, formatBytes } from '@/lib/utils';
import { uploadVideo } from '@/lib/video-upload-client';
import {
  addBlockAction,
  deleteBlockAction,
  reorderBlocksAction,
  saveAssignmentSettingsAction,
  saveQuizSettingsAction,
  setExternalVideoAction,
  updateBlockAction,
} from '@/server/studio-actions';
import { RichEditor } from './rich-editor';

export type EBlock = {
  id: string;
  type: BlockType;
  title: string;
  required: boolean;
  html?: string;
  url?: string;
  description?: string;
  file?: { id: string; name: string; size: number } | null;
  media?: { id: string; filename: string | null; status: MediaStatus; provider: 'bunny' | 'external'; url: string | null } | null;
  quiz?: {
    bankId: string | null;
    countEasy: number;
    countMedium: number;
    countHard: number;
    timeLimitMin: number | null;
    attemptsAllowed: number;
    shuffle: boolean;
    showResults: boolean;
  } | null;
  assignment?: { instructions: string | null; criteria: string | null; maxScore: number; allowedExt: string; maxFiles: number } | null;
};
export type EBank = { id: string; title: string; easy: number; medium: number; hard: number };

const TYPES: { type: BlockType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'video', icon: Video },
  { type: 'text', icon: Type },
  { type: 'file', icon: FileText },
  { type: 'quiz', icon: ClipboardCheck },
  { type: 'assignment', icon: ListChecks },
  { type: 'link', icon: Link2 },
];

export function LessonEditor({
  courseId,
  lessonId,
  initial,
  banks,
  bunny,
}: {
  courseId: string;
  lessonId: string;
  initial: EBlock[];
  banks: EBank[];
  bunny: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [blocks, setBlocks] = useState(initial);
  const [pending, start] = useTransition();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(
      blocks,
      blocks.findIndex((b) => b.id === e.active.id),
      blocks.findIndex((b) => b.id === e.over!.id),
    );
    setBlocks(next);
    start(() => reorderBlocksAction(lessonId, next.map((b) => b.id)).then(() => undefined));
  }

  return (
    <div>
      {blocks.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-fg-muted">{t('studio.lesson.empty')}</p>}
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {blocks.map((b) => (
              <BlockCard
                key={b.id}
                courseId={courseId}
                block={b}
                banks={banks}
                bunny={bunny}
                onChange={(patch) => setBlocks((bs) => bs.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))}
                onDelete={() => {
                  if (!window.confirm(t('studio.builder.deleteBlock'))) return;
                  setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                  start(() => deleteBlockAction(b.id).then(() => undefined));
                }}
                onRefresh={() => router.refresh()}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div data-card className="mt-5 rounded-xl border border-dashed border-border bg-surface p-4">
        <p className="mb-3 font-medium">{t('studio.lesson.addBlock')}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {TYPES.map(({ type, icon: I }) => (
            <button
              key={type}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const row = await addBlockAction(lessonId, type);
                  setBlocks((bs) => [
                    ...bs,
                    {
                      id: row.id,
                      type,
                      title: '',
                      required: row.required,
                      quiz: type === 'quiz' ? { bankId: banks[0]?.id ?? null, countEasy: 5, countMedium: 3, countHard: 2, timeLimitMin: null, attemptsAllowed: 1, shuffle: true, showResults: true } : null,
                      assignment: type === 'assignment' ? { instructions: '', criteria: '', maxScore: 100, allowedExt: 'pdf,docx,doc,pptx,xlsx,zip,jpg,png', maxFiles: 5 } : null,
                    },
                  ]);
                })
              }
              className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <I className="size-6" />
              {t(`enums.blockType.${type}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BlockCard({
  courseId,
  block: b,
  banks,
  bunny,
  onChange,
  onDelete,
  onRefresh,
}: {
  courseId: string;
  block: EBlock;
  banks: EBank[];
  bunny: boolean;
  onChange: (patch: Partial<EBlock>) => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const [, start] = useTransition();
  const Icon = TYPES.find((x) => x.type === b.type)!.icon;
  const save = (patch: Parameters<typeof updateBlockAction>[1]) => start(() => updateBlockAction(b.id, patch).then(() => undefined));

  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-card className={cn('rounded-xl border border-border bg-surface shadow-sm', isDragging && 'z-10 shadow-lg')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <button type="button" {...attributes} {...listeners} aria-label="drag" className="inline-flex size-9 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted hover:bg-surface-2">
          <GripVertical className="size-4" />
        </button>
        <Badge tone="brand">
          <Icon className="size-3.5" />
          {t(`enums.blockType.${b.type}`)}
        </Badge>
        <input
          defaultValue={b.title}
          placeholder={t('studio.lesson.blockTitle')}
          onBlur={(e) => e.target.value !== b.title && (onChange({ title: e.target.value }), save({ title: e.target.value }))}
          className="h-10 min-w-0 flex-1 basis-40 rounded-md border border-transparent bg-transparent px-2 font-medium hover:border-border focus:border-brand focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-sm text-fg-muted" title={t('studio.lesson.requiredHint')}>
          <input
            type="checkbox"
            checked={b.required}
            onChange={(e) => {
              onChange({ required: e.target.checked });
              save({ required: e.target.checked });
            }}
            className="size-4 accent-[var(--brand)]"
          />
          {t('studio.builder.required')}
        </label>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={t('common.delete')}>
          <Trash2 />
        </Button>
      </div>
      <div className="p-4">
        {b.type === 'text' && <TextBody block={b} />}
        {b.type === 'link' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('studio.lesson.url')} hint={t('studio.lesson.urlHint')}>
              <Input defaultValue={b.url ?? ''} placeholder="https://" onBlur={(e) => save({ url: e.target.value })} inputMode="url" />
            </Field>
            <Field label={t('studio.lesson.description')}>
              <Input defaultValue={b.description ?? ''} onBlur={(e) => save({ description: e.target.value })} />
            </Field>
          </div>
        )}
        {b.type === 'file' && <FileBody block={b} onChange={onChange} save={save} />}
        {b.type === 'video' && <VideoBody courseId={courseId} block={b} bunny={bunny} onRefresh={onRefresh} />}
        {b.type === 'quiz' && <QuizBody courseId={courseId} block={b} banks={banks} />}
        {b.type === 'assignment' && <AssignmentBody block={b} />}
      </div>
    </section>
  );
}

function TextBody({ block }: { block: EBlock }) {
  const t = useTranslations();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const flush = () => {
    if (latest.current === null) return;
    const html = latest.current;
    latest.current = null;
    setState('saving');
    updateBlockAction(block.id, { html })
      .then(() => setState('saved'))
      .catch(() => toast.error(t('common.somethingWrong')));
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <RichEditor
        value={block.html ?? ''}
        placeholder={t('studio.lesson.textPlaceholder')}
        onChange={(html) => {
          latest.current = html;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 1200);
        }}
      />
      <p className="mt-1 text-right text-xs text-fg-muted">{state === 'saving' ? t('common.saving') : state === 'saved' ? t('common.saved') : ''}</p>
    </div>
  );
}

function FileBody({ block, onChange, save }: { block: EBlock; onChange: (p: Partial<EBlock>) => void; save: (p: Parameters<typeof updateBlockAction>[1]) => void }) {
  const t = useTranslations();
  const [progress, setProgress] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {block.file ? (
        <a href={`/api/files/${block.file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand hover:underline">
          <FileText className="size-5" />
          {block.file.name} <span className="text-sm text-fg-muted">({formatBytes(block.file.size)})</span>
        </a>
      ) : (
        <span className="text-sm text-fg-muted">{t('learn.file.missing')}</span>
      )}
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:border-brand hover:text-brand">
        {progress !== null ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {progress !== null ? `${progress}%` : block.file ? t('studio.lesson.replaceFile') : t('studio.lesson.uploadFile')}
        <input
          type="file"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > MAX_UPLOAD_BYTES) {
              toast.error(t('learn.assignment.tooBig', { size: formatBytes(MAX_UPLOAD_BYTES) }));
              return;
            }
            setProgress(0);
            try {
              const up = await uploadFile(f, { prefix: 'materials', onProgress: setProgress });
              onChange({ file: { id: up.id, name: up.filename, size: up.size } });
              save({ fileId: up.id, ...(block.title ? {} : { title: f.name.replace(/\.[^.]+$/, '') }) });
            } catch {
              toast.error(t('common.somethingWrong'));
            } finally {
              setProgress(null);
            }
          }}
        />
      </label>
    </div>
  );
}

function VideoBody({ courseId, block, bunny, onRefresh }: { courseId: string; block: EBlock; bunny: boolean; onRefresh: () => void }) {
  const t = useTranslations();
  const [progress, setProgress] = useState<number | null>(null);
  const [url, setUrl] = useState(block.media?.provider === 'external' ? (block.media.url ?? '') : '');
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {block.media && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Video className="size-4 text-fg-muted" />
          {t('studio.lesson.video.current', { name: block.media.filename ?? block.media.url ?? '' })}
          <Badge tone={block.media.status === 'ready' ? 'success' : block.media.status === 'error' ? 'danger' : 'warning'}>{t(`statuses.media.${block.media.status}`)}</Badge>
        </p>
      )}
      {bunny ? (
        <div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover">
            {progress !== null ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {progress !== null ? t('studio.lesson.video.uploading', { percent: progress }) : block.media ? t('studio.lesson.video.replace') : t('studio.lesson.video.upload')}
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              disabled={progress !== null}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setProgress(0);
                const res = await uploadVideo({ courseId, file: f, blockId: block.id, onProgress: setProgress });
                setProgress(null);
                if ('error' in res) toast.error(t('common.somethingWrong'));
                onRefresh();
              }}
            />
          </label>
          <p className="mt-1 text-xs text-fg-muted">{t('studio.lesson.video.resumeHint')}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">{t('studio.lesson.video.noBunny')}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('studio.lesson.video.orLink')} className="min-w-0 flex-1">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('studio.lesson.video.linkPlaceholder')} inputMode="url" />
        </Field>
        <Button
          variant="secondary"
          disabled={pending || !url.trim()}
          onClick={() =>
            start(async () => {
              const res = await setExternalVideoAction(block.id, url);
              if ('error' in res) toast.error(t('common.somethingWrong'));
              else {
                toast.success(t('common.saved'));
                onRefresh();
              }
            })
          }
        >
          {t('studio.lesson.video.useLink')}
        </Button>
      </div>
    </div>
  );
}

function QuizBody({ courseId, block, banks }: { courseId: string; block: EBlock; banks: EBank[] }) {
  const t = useTranslations();
  const q = block.quiz ?? { bankId: banks[0]?.id ?? null, countEasy: 5, countMedium: 3, countHard: 2, timeLimitMin: null, attemptsAllowed: 1, shuffle: true, showResults: true };
  const [bankId, setBankId] = useState(q.bankId ?? banks[0]?.id ?? '');
  const [pending, start] = useTransition();
  const bank = banks.find((b) => b.id === bankId);
  if (banks.length === 0)
    return (
      <p className="text-sm">
        {t('studio.lesson.quiz.noBank')} —{' '}
        <Link href={`/studio/${courseId}/questions`} className="font-medium text-brand hover:underline">
          {t('studio.questions.title')}
        </Link>
      </p>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const n = (k: string) => Number(fd.get(k) ?? 0);
        start(async () => {
          try {
            await saveQuizSettingsAction(block.id, {
              bankId: bankId || null,
              countEasy: n('countEasy'),
              countMedium: n('countMedium'),
              countHard: n('countHard'),
              timeLimitMin: fd.get('timeLimitMin') ? n('timeLimitMin') : null,
              attemptsAllowed: Math.max(1, n('attemptsAllowed')),
              shuffle: fd.get('shuffle') === 'on',
              showResults: fd.get('showResults') === 'on',
            });
            toast.success(t('common.saved'));
          } catch {
            toast.error(t('common.somethingWrong'));
          }
        });
      }}
    >
      <Field label={t('studio.lesson.quiz.bank')}>
        <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.easy + b.medium + b.hard})
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('studio.lesson.quiz.easy')} hint={t('studio.lesson.quiz.available', { n: bank?.easy ?? 0 })}>
          <Input name="countEasy" type="number" min={0} defaultValue={q.countEasy} />
        </Field>
        <Field label={t('studio.lesson.quiz.medium')} hint={t('studio.lesson.quiz.available', { n: bank?.medium ?? 0 })}>
          <Input name="countMedium" type="number" min={0} defaultValue={q.countMedium} />
        </Field>
        <Field label={t('studio.lesson.quiz.hard')} hint={t('studio.lesson.quiz.available', { n: bank?.hard ?? 0 })}>
          <Input name="countHard" type="number" min={0} defaultValue={q.countHard} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('studio.lesson.quiz.timeLimit')}>
          <Input name="timeLimitMin" type="number" min={1} defaultValue={q.timeLimitMin ?? ''} />
        </Field>
        <Field label={t('studio.lesson.quiz.attempts')}>
          <Input name="attemptsAllowed" type="number" min={1} max={20} defaultValue={q.attemptsAllowed} />
        </Field>
      </div>
      <Checkbox name="shuffle" defaultChecked={q.shuffle} label={t('studio.lesson.quiz.shuffle')} />
      <Checkbox name="showResults" defaultChecked={q.showResults} label={t('studio.lesson.quiz.showResults')} />
      <Button type="submit" disabled={pending}>
        {t('common.save')}
      </Button>
    </form>
  );
}

function AssignmentBody({ block }: { block: EBlock }) {
  const t = useTranslations();
  const a = block.assignment ?? { instructions: '', criteria: '', maxScore: 100, allowedExt: 'pdf,docx', maxFiles: 5 };
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          try {
            await saveAssignmentSettingsAction(block.id, {
              instructions: String(fd.get('instructions') ?? '') || null,
              criteria: String(fd.get('criteria') ?? '') || null,
              maxScore: Number(fd.get('maxScore') ?? 100),
              allowedExt: String(fd.get('allowedExt') ?? ''),
              maxFiles: Number(fd.get('maxFiles') ?? 5),
            });
            toast.success(t('common.saved'));
          } catch {
            toast.error(t('common.somethingWrong'));
          }
        });
      }}
    >
      <Field label={t('studio.lesson.assignment.instructions')}>
        <Textarea name="instructions" defaultValue={a.instructions ?? ''} rows={4} />
      </Field>
      <Field label={t('studio.lesson.assignment.criteria')}>
        <Textarea name="criteria" defaultValue={a.criteria ?? ''} rows={3} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('studio.lesson.assignment.maxScore')}>
          <Input name="maxScore" type="number" min={1} defaultValue={a.maxScore} />
        </Field>
        <Field label={t('studio.lesson.assignment.allowedExt')}>
          <Input name="allowedExt" defaultValue={a.allowedExt} />
        </Field>
        <Field label={t('studio.lesson.assignment.maxFiles')}>
          <Input name="maxFiles" type="number" min={1} max={20} defaultValue={a.maxFiles} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {t('common.save')}
      </Button>
    </form>
  );
}
