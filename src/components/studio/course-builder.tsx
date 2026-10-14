'use client';

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, ClipboardCheck, FileText, GripVertical, Link2, ListChecks, Plus, Trash2, Type, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BlockType } from '@/db/schema';
import { cn } from '@/lib/utils';
import {
  addLessonAction,
  addModuleAction,
  deleteLessonAction,
  deleteModuleAction,
  reorderLessonsAction,
  reorderModulesAction,
  updateLessonAction,
  updateModuleAction,
} from '@/server/studio-actions';

export type BLesson = { id: string; title: string; required: boolean; estMinutes: number | null; blocks: BlockType[] };
export type BModule = { id: string; week: number; title: string; lessons: BLesson[] };

const ICON: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  text: Type,
  file: FileText,
  quiz: ClipboardCheck,
  assignment: ListChecks,
  link: Link2,
};

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function Handle(props: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 active:cursor-grabbing" {...props}>
      <GripVertical className="size-4" />
    </button>
  );
}

/** Структура курса: модули (недели) → уроки. Перетаскивание и автосохранение. */
export function CourseBuilder({ courseId, initial, readOnly }: { courseId: string; initial: BModule[]; readOnly?: boolean }) {
  const t = useTranslations('studio.builder');
  const tc = useTranslations('common');
  const router = useRouter();
  const [mods, setMods] = useState(initial);
  const [pending, start] = useTransition();
  const sensors = useDndSensors();
  const dndId = useId();

  function onModulesDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = mods.findIndex((m) => m.id === e.active.id);
    const to = mods.findIndex((m) => m.id === e.over!.id);
    const next = arrayMove(mods, from, to);
    setMods(next);
    start(() => reorderModulesAction(courseId, next.map((m) => m.id)).then(() => undefined));
  }

  function patchModule(id: string, patch: Partial<BModule>) {
    setMods((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  return (
    <div>
      {mods.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-fg-muted">{t('empty')}</p>}
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onModulesDragEnd}>
        <SortableContext items={mods.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {mods.map((m) => (
              <ModuleCard
                key={m.id}
                courseId={courseId}
                module={m}
                readOnly={readOnly}
                onChange={(patch) => patchModule(m.id, patch)}
                onDelete={() => {
                  if (!window.confirm(t('deleteModule'))) return;
                  setMods((ms) => ms.filter((x) => x.id !== m.id));
                  start(() => deleteModuleAction(m.id).then(() => router.refresh()));
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const row = await addModuleAction(courseId, t('newModule'));
                setMods((ms) => [...ms, { id: row.id, week: row.week, title: row.title, lessons: [] }]);
              })
            }
          >
            <Plus />
            {t('addModule')}
          </Button>
          <span className="text-sm text-fg-muted">{t('dragHint')}</span>
          <span className="ml-auto text-xs text-fg-muted">{pending ? tc('saving') : t('autosaved')}</span>
        </div>
      )}
    </div>
  );
}

function ModuleCard({
  courseId,
  module: m,
  readOnly,
  onChange,
  onDelete,
}: {
  courseId: string;
  module: BModule;
  readOnly?: boolean;
  onChange: (patch: Partial<BModule>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('studio.builder');
  const tc = useTranslations('common');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: readOnly });
  const sensors = useDndSensors();
  const dndId = useId();
  const [pending, start] = useTransition();

  function onLessonsDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = m.lessons.findIndex((l) => l.id === e.active.id);
    const to = m.lessons.findIndex((l) => l.id === e.over!.id);
    const next = arrayMove(m.lessons, from, to);
    onChange({ lessons: next });
    start(() => reorderLessonsAction(m.id, next.map((l) => l.id)).then(() => undefined));
  }

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-card
      className={cn('rounded-xl border border-border bg-surface shadow-sm', isDragging && 'z-10 opacity-80 shadow-lg')}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5 sm:p-3">
        {!readOnly && <Handle {...attributes} {...listeners} aria-label="drag module" />}
        <label className="flex items-center gap-1.5 text-sm text-fg-muted">
          {t('week')}
          <input
            type="number"
            min={1}
            max={60}
            defaultValue={m.week}
            disabled={readOnly}
            onBlur={(e) => {
              const week = Number(e.target.value);
              if (week !== m.week && week >= 1) {
                onChange({ week });
                start(() => updateModuleAction(m.id, { week }).then(() => undefined));
              }
            }}
            className="h-9 w-14 rounded-md border border-border bg-surface px-2 text-center text-fg"
          />
        </label>
        <input
          defaultValue={m.title}
          disabled={readOnly}
          aria-label={t('moduleTitle')}
          onBlur={(e) => {
            const title = e.target.value;
            if (title !== m.title) {
              onChange({ title });
              start(() => updateModuleAction(m.id, { title }).then(() => undefined));
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-base font-semibold hover:border-border focus:border-brand focus:outline-none"
        />
        {!readOnly && (
          <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={tc('delete')}>
            <Trash2 />
          </Button>
        )}
      </div>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onLessonsDragEnd}>
        <SortableContext items={m.lessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          <ul>
            {m.lessons.map((l) => (
              <LessonRow
                key={l.id}
                courseId={courseId}
                lesson={l}
                readOnly={readOnly}
                onChange={(patch) => onChange({ lessons: m.lessons.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) })}
                onDelete={() => {
                  if (!window.confirm(t('deleteLesson'))) return;
                  onChange({ lessons: m.lessons.filter((x) => x.id !== l.id) });
                  start(() => deleteLessonAction(l.id).then(() => undefined));
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <div className="p-2.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const row = await addLessonAction(m.id, t('newLesson'));
                onChange({ lessons: [...m.lessons, { id: row.id, title: row.title, required: row.required, estMinutes: row.estMinutes, blocks: [] }] });
              })
            }
          >
            <Plus />
            {t('addLesson')}
          </Button>
        </div>
      )}
    </section>
  );
}

function LessonRow({
  courseId,
  lesson: l,
  readOnly,
  onChange,
  onDelete,
}: {
  courseId: string;
  lesson: BLesson;
  readOnly?: boolean;
  onChange: (patch: Partial<BLesson>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('studio.builder');
  const tc = useTranslations('common');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: l.id, disabled: readOnly });
  const [, start] = useTransition();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2.5 py-2 last:border-b-0 sm:flex-nowrap', isDragging && 'relative z-10 shadow-md')}
    >
      {!readOnly && <Handle {...attributes} {...listeners} aria-label="drag lesson" />}
      <input
        defaultValue={l.title}
        disabled={readOnly}
        aria-label={t('lessonTitle')}
        onBlur={(e) => {
          const title = e.target.value;
          if (title !== l.title) {
            onChange({ title });
            start(() => updateLessonAction(l.id, { title }).then(() => undefined));
          }
        }}
        className="h-10 min-w-0 flex-1 basis-48 rounded-md border border-transparent bg-transparent px-2 hover:border-border focus:border-brand focus:outline-none"
      />
      <span className="flex shrink-0 items-center gap-1 text-fg-muted" aria-label={t('blocksN', { n: l.blocks.length })}>
        {l.blocks.slice(0, 6).map((b, i) => {
          const I = ICON[b];
          return <I key={i} className="size-4" />;
        })}
      </span>
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={l.required}
          disabled={readOnly}
          onChange={(e) => {
            onChange({ required: e.target.checked });
            start(() => updateLessonAction(l.id, { required: e.target.checked }).then(() => undefined));
          }}
          className="size-4 accent-[var(--brand)]"
        />
        {t('required')}
      </label>
      <label className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
        <input
          type="number"
          min={0}
          max={999}
          defaultValue={l.estMinutes ?? ''}
          disabled={readOnly}
          onBlur={(e) => {
            const n = e.target.value ? Number(e.target.value) : null;
            if (n !== l.estMinutes) start(() => updateLessonAction(l.id, { estMinutes: n }).then(() => undefined));
          }}
          className="h-9 w-14 rounded-md border border-border bg-surface px-1.5 text-center text-sm text-fg"
          aria-label={t('minutes')}
        />
        {tc('minutes')}
      </label>
      <Link href={`/studio/${courseId}/lessons/${l.id}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-brand hover:bg-brand-soft">
        {t('edit')}
        <ChevronRight className="size-4" />
      </Link>
      {!readOnly && (
        <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label={tc('delete')}>
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
