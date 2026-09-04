'use client';

import { CheckCircle2, Circle, FileText, Film, HelpCircle, Link2, Paperclip, PenLine } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { workTypeLabel, type WorkTypeCode } from '@/domain/hours';

const ICONS = {
  TEXT: FileText,
  FILE: Paperclip,
  VIDEO: Film,
  QUIZ: HelpCircle,
  ASSIGNMENT: PenLine,
  LINK: Link2,
} as const;

export interface SidebarItem {
  id: string;
  title: string;
  type: keyof typeof ICONS;
  plannedAcademicHours: number;
  workType: string;
  completed: boolean;
}

export interface SidebarModule {
  id: string;
  title: string;
  weekNumber: number | null;
  items: SidebarItem[];
}

/**
 * Раздел 8.2 ТЗ: на странице прохождения курса — постоянная боковая навигация
 * с модулями, отметками о завершении и индикатором прогресса.
 */
export function CourseSidebar({
  courseId,
  modules,
}: {
  courseId: string;
  modules: SidebarModule[];
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Структура курса" className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      <ol className="space-y-4">
        {modules.map((m, mi) => {
          const done = m.items.filter((i) => i.completed).length;
          return (
            <li key={m.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">
                  {m.weekNumber ? `Неделя ${m.weekNumber}` : `Модуль ${mi + 1}`}. {m.title}
                </h3>
                <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                  {done}/{m.items.length}
                </span>
              </div>
              <ul className="space-y-0.5">
                {m.items.map((item) => {
                  const Icon = ICONS[item.type] ?? FileText;
                  const href = `/my/courses/${courseId}/items/${item.id}`;
                  const active = pathname.endsWith(`/items/${item.id}`);
                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        className={cn(
                          'flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                          active ? 'bg-brand/12 text-brand' : 'text-fg-muted hover:bg-muted hover:text-fg'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        {item.completed ? (
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-label="Завершено" />
                        ) : (
                          <Circle size={15} className="mt-0.5 shrink-0 opacity-40" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <Icon size={13} className="shrink-0 opacity-70" aria-hidden />
                            <span className="leading-snug">{item.title}</span>
                          </span>
                          <span className="mt-0.5 block text-xs opacity-70">
                            {workTypeLabel(item.workType as WorkTypeCode)} · {item.plannedAcademicHours} ч
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
