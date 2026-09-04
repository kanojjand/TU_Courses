'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown, ChevronUp, FileText, Film, GripVertical, HelpCircle,
  Link2, Paperclip, PenLine, Plus, Trash2,
} from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { HoursIndicator } from './hours-indicator';
import { ItemEditor } from './item-editor';
import {
  createContentItem, createModule, deleteContentItem, deleteModule,
  reorderItems, reorderModules,
} from '@/server/actions/course-builder';
import type { HoursValidationResult } from '@/domain/hours';
import { workTypeLabel, type WorkTypeCode } from '@/domain/hours';
import { cn } from '@/lib/utils';

const TYPE_ICONS = {
  TEXT: FileText, FILE: Paperclip, VIDEO: Film,
  QUIZ: HelpCircle, ASSIGNMENT: PenLine, LINK: Link2,
} as const;

const TYPE_LABELS: Record<keyof typeof TYPE_ICONS, string> = {
  TEXT: 'Лекция (текст)',
  FILE: 'Файл (PDF, презентация)',
  VIDEO: 'Видео по ссылке',
  QUIZ: 'Тест',
  ASSIGNMENT: 'Задание',
  LINK: 'Внешний ресурс',
};

export interface BuilderItem {
  id: string;
  type: keyof typeof TYPE_ICONS;
  title: string;
  description: string | null;
  plannedAcademicHours: number;
  workType: string;
  contentHtml: string | null;
  externalUrl: string | null;
  completionThreshold: number;
  isPublished: boolean;
  attachments: { id: string; fileName: string; sizeBytes: number }[];
  quizId: string | null;
  quizQuestions: number;
  assignmentId: string | null;
}

export interface BuilderModule {
  id: string;
  title: string;
  description: string | null;
  weekNumber: number | null;
  isPublished: boolean;
  items: BuilderItem[];
}

/**
 * F-T-03. Конструктор курса: модули, элементы, изменение порядка.
 *
 * Раздел 8.2 ТЗ: конструктор ведёт преподавателя — индикатор распределения
 * часов постоянно на экране.
 */
export function CourseBuilder({
  courseId,
  credits,
  modules: initialModules,
  validation,
}: {
  courseId: string;
  credits: number;
  modules: BuilderModule[];
  validation: HoursValidationResult;
}) {
  const t = useTranslations('teacher');
  const tc = useTranslations('common');
  const [modules, setModules] = useState(initialModules);
  const [openModule, setOpenModule] = useState<string | null>(initialModules[0]?.id ?? null);
  const [editingItem, setEditingItem] = useState<{ moduleId: string; item: BuilderItem } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addModule(formData: FormData) {
    startTransition(async () => {
      try {
        const weekRaw = String(formData.get('weekNumber') ?? '');
        await createModule({
          courseId,
          title: String(formData.get('title') ?? ''),
          weekNumber: weekRaw ? Number(weekRaw) : null,
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : tc('error'));
      }
    });
  }

  function addItem(moduleId: string, formData: FormData) {
    startTransition(async () => {
      try {
        await createContentItem({
          moduleId,
          type: formData.get('type') as BuilderItem['type'],
          title: String(formData.get('title') ?? ''),
          plannedAcademicHours: Number(formData.get('plannedAcademicHours') ?? 0),
          workType: formData.get('workType') as WorkTypeCode,
          externalUrl: String(formData.get('externalUrl') ?? ''),
          completionThreshold: 80,
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : tc('error'));
      }
    });
  }

  function moveModule(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next);
    startTransition(() => reorderModules(courseId, next.map((m) => m.id)));
  }

  function moveItem(moduleId: string, index: number, delta: number) {
    const current = modules.find((m) => m.id === moduleId);
    if (!current) return;
    const target = index + delta;
    if (target < 0 || target >= current.items.length) return;

    const items = [...current.items];
    [items[index], items[target]] = [items[target], items[index]];
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, items } : m)));
    startTransition(() => reorderItems(moduleId, items.map((i) => i.id)));
  }

  if (editingItem) {
    return (
      <ItemEditor
        courseId={courseId}
        item={editingItem.item}
        onClose={() => setEditingItem(null)}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {modules.length === 0 && (
          <EmptyState
            title="Курс пока не содержит модулей"
            description="Начните с создания модуля — обычно он соответствует учебной неделе или теме."
          />
        )}

        <ol className="space-y-3">
          {modules.map((m, mi) => {
            const moduleHours = m.items.reduce((s, i) => s + i.plannedAcademicHours, 0);
            const open = openModule === m.id;

            return (
              <li key={m.id}>
                <Card>
                  <CardHeader className="flex flex-wrap items-center gap-2">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label="Переместить модуль выше"
                        className="text-fg-muted hover:text-fg disabled:opacity-30"
                        disabled={mi === 0 || pending}
                        onClick={() => moveModule(mi, -1)}
                      >
                        <ChevronUp size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="Переместить модуль ниже"
                        className="text-fg-muted hover:text-fg disabled:opacity-30"
                        disabled={mi === modules.length - 1 || pending}
                        onClick={() => moveModule(mi, 1)}
                      >
                        <ChevronDown size={14} aria-hidden />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setOpenModule(open ? null : m.id)}
                      aria-expanded={open}
                    >
                      <CardTitle className="truncate">
                        {m.weekNumber ? `Неделя ${m.weekNumber}. ` : `${mi + 1}. `}
                        {m.title}
                      </CardTitle>
                    </button>

                    <Badge>{m.items.length} элем.</Badge>
                    <Badge tone="brand">{Math.round(moduleHours * 10) / 10} ч</Badge>

                    <button
                      type="button"
                      aria-label="Удалить модуль"
                      className="text-fg-muted hover:text-danger"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Удалить модуль «${m.title}» со всеми элементами?`)) return;
                        startTransition(async () => {
                          await deleteModule(m.id);
                          window.location.reload();
                        });
                      }}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </CardHeader>

                  {open && (
                    <CardBody className="space-y-3">
                      {m.items.length === 0 ? (
                        <p className="text-sm text-fg-muted">Модуль пуст.</p>
                      ) : (
                        <ol className="space-y-1.5">
                          {m.items.map((item, ii) => {
                            const Icon = TYPE_ICONS[item.type] ?? FileText;
                            return (
                              <li
                                key={item.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
                              >
                                <GripVertical size={14} className="shrink-0 text-fg-muted" aria-hidden />
                                <Icon size={15} className="shrink-0 text-fg-muted" aria-hidden />

                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left text-sm hover:text-brand"
                                  onClick={() => setEditingItem({ moduleId: m.id, item })}
                                >
                                  {item.title}
                                </button>

                                <span className="shrink-0 text-xs text-fg-muted">
                                  {workTypeLabel(item.workType as WorkTypeCode)}
                                </span>
                                <Badge
                                  tone={item.plannedAcademicHours > 0 ? 'brand' : 'danger'}
                                  className="shrink-0"
                                >
                                  {item.plannedAcademicHours} ч
                                </Badge>
                                {item.type === 'QUIZ' && (
                                  <Badge className="shrink-0">{item.quizQuestions} вопр.</Badge>
                                )}

                                <div className="flex shrink-0 items-center">
                                  <button
                                    type="button"
                                    aria-label="Выше"
                                    className="px-1 text-fg-muted hover:text-fg disabled:opacity-30"
                                    disabled={ii === 0 || pending}
                                    onClick={() => moveItem(m.id, ii, -1)}
                                  >
                                    <ChevronUp size={14} aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Ниже"
                                    className="px-1 text-fg-muted hover:text-fg disabled:opacity-30"
                                    disabled={ii === m.items.length - 1 || pending}
                                    onClick={() => moveItem(m.id, ii, 1)}
                                  >
                                    <ChevronDown size={14} aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Удалить элемент"
                                    className="px-1 text-fg-muted hover:text-danger"
                                    disabled={pending}
                                    onClick={() => {
                                      if (!confirm(`Удалить «${item.title}»?`)) return;
                                      startTransition(async () => {
                                        await deleteContentItem(item.id);
                                        window.location.reload();
                                      });
                                    }}
                                  >
                                    <Trash2 size={14} aria-hidden />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}

                      {addingTo === m.id ? (
                        <form
                          action={(fd) => addItem(m.id, fd)}
                          className="space-y-3 rounded-lg border border-dashed border-border p-3"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Тип элемента" required>
                              <Select name="type" required defaultValue="TEXT">
                                {Object.entries(TYPE_LABELS).map(([v, label]) => (
                                  <option key={v} value={v}>{label}</option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Название" required>
                              <Input name="title" required maxLength={300} />
                            </Field>
                            <Field
                              label={t('plannedHours')}
                              hint="Академических часов на элемент"
                              required
                            >
                              <Input
                                name="plannedAcademicHours"
                                type="number"
                                step="0.5"
                                min="0"
                                defaultValue="1"
                                required
                              />
                            </Field>
                            <Field label={t('workType')} required>
                              <Select name="workType" required defaultValue="LECTURE">
                                <option value="LECTURE">Лекция</option>
                                <option value="PRACTICE">Практическое занятие</option>
                                <option value="LAB">Лабораторное занятие</option>
                                <option value="SROP">СРОП</option>
                                <option value="SRO">СРО</option>
                              </Select>
                            </Field>
                            <div className="sm:col-span-2">
                              <Field label="Ссылка" hint="Для видео (YouTube, Vimeo) и внешних ресурсов">
                                <Input name="externalUrl" type="url" placeholder="https://" />
                              </Field>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" disabled={pending}>
                              {tc('add')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setAddingTo(null)}
                            >
                              {tc('cancel')}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAddingTo(m.id)}>
                          <Plus size={14} aria-hidden /> {t('addItem')}
                        </Button>
                      )}
                    </CardBody>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>

        <Card>
          <CardBody>
            <form action={addModule} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Field label="Название модуля" required>
                  <Input name="title" required maxLength={300} placeholder="Введение в дисциплину" />
                </Field>
              </div>
              <div className="w-28">
                <Field label="Неделя">
                  <Input name="weekNumber" type="number" min="1" max="52" />
                </Field>
              </div>
              <Button type="submit" disabled={pending}>
                <Plus size={15} aria-hidden /> {t('addModule')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      {/* Индикатор часов постоянно на экране (раздел 8.2) */}
      <aside>
        <Card className={cn('lg:sticky lg:top-20', !validation.valid && 'border-warning/50')}>
          <CardHeader><CardTitle>Распределение часов</CardTitle></CardHeader>
          <CardBody>
            <HoursIndicator validation={validation} />
            <p className="mt-4 border-t border-border pt-3 text-xs text-fg-muted">
              Публикация возможна только при полном соответствии суммы плановых часов
              объёму дисциплины: {credits} кр. × 30 ч = {credits * 30} ч.
            </p>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
