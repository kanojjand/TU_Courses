'use client';

import { Download, FileSpreadsheet, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import type { QuestionType } from '@/db/schema';
import { cn } from '@/lib/utils';
import { createBankAction, deleteBankAction, deleteQuestionAction, renameBankAction, saveQuestionAction } from '@/server/bank-actions';
import { importQuizFileAction } from '@/server/import-course-actions';

export type QBQuestion = {
  id: string;
  type: QuestionType;
  text: string;
  difficulty: number;
  answers: string[];
  options: { text: string; isCorrect: boolean; matchText: string | null }[];
};
export type QBBank = { id: string; title: string; questions: QBQuestion[] };

const TYPES: QuestionType[] = ['single', 'multiple', 'matching', 'ordering', 'short'];

export function QuestionBank({ courseId, banks }: { courseId: string; banks: QBBank[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [active, setActive] = useState(banks[0]?.id ?? '');
  const [editing, setEditing] = useState<QBQuestion | 'new' | null>(null);
  const [pending, start] = useTransition();
  const bank = banks.find((b) => b.id === active);

  function importFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    if (bank) fd.append('bankId', bank.id);
    start(async () => {
      const res = await importQuizFileAction(courseId, fd);
      if ('error' in res) toast.error(t('common.somethingWrong'));
      else {
        toast.success(t('studio.questions.imported', { n: res.count }));
        if (res.errors.length) toast.warning(t('studio.questions.importErrors', { rows: res.errors.map((e) => e.row).join(', ') }));
        if (res.bankId) setActive(res.bankId);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {banks.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setActive(b.id)}
            className={cn('min-h-10 rounded-full border px-4 text-sm font-medium', b.id === active ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface hover:border-brand/40')}
          >
            {b.title} <span className="text-fg-muted">({b.questions.length})</span>
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            const title = window.prompt(t('studio.questions.bankTitle'));
            if (!title) return;
            start(async () => {
              const b = await createBankAction(courseId, title);
              setActive(b.id);
              router.refresh();
            });
          }}
        >
          <Plus />
          {t('studio.questions.newBank')}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {bank && (
          <Button onClick={() => setEditing('new')}>
            <Plus />
            {t('studio.questions.addQuestion')}
          </Button>
        )}
        <label className={buttonClass('secondary')}>
          <FileSpreadsheet />
          {t('studio.questions.importExcel')}
          <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <a href="/api/templates/quiz" className={buttonClass('ghost')}>
          <Download />
          {t('studio.questions.template')}
        </a>
        {bank && (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                const title = window.prompt(t('studio.questions.bankTitle'), bank.title);
                if (title) start(() => renameBankAction(bank.id, title).then(() => router.refresh()));
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(t('studio.questions.deleteBank'))) start(() => deleteBankAction(bank.id).then(() => router.refresh()));
              }}
              aria-label={t('common.delete')}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      <p className="mb-4 text-xs text-fg-muted">{t('studio.questions.formatHelp')}</p>

      {!bank ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-fg-muted">{t('studio.questions.noBanks')}</p>
      ) : bank.questions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-fg-muted">{t('studio.questions.noQuestions')}</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-fg-muted">
            {t('studio.questions.byDifficulty', {
              e: bank.questions.filter((q) => q.difficulty === 1).length,
              m: bank.questions.filter((q) => q.difficulty === 2).length,
              h: bank.questions.filter((q) => q.difficulty === 3).length,
            })}
          </p>
          <ol data-card className="divide-y divide-border rounded-xl border border-border bg-surface">
            {bank.questions.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 p-3.5">
                <span className="w-6 shrink-0 text-right text-sm text-fg-muted">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">{q.text}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{t(`enums.questionType.${q.type}`)}</Badge>
                    <Badge tone={q.difficulty === 3 ? 'danger' : q.difficulty === 2 ? 'warning' : 'success'}>
                      {t('studio.questions.difficulty')}: {q.difficulty}
                    </Badge>
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(q)} aria-label={t('common.edit')}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => window.confirm(t('studio.questions.deleteQuestion')) && start(() => deleteQuestionAction(q.id).then(() => router.refresh()))}
                  aria-label={t('common.delete')}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && bank && (
          <DialogContent title={t('studio.questions.question')} wide>
            <QuestionForm
              initial={editing === 'new' ? null : editing}
              pending={pending}
              onSave={(data) =>
                start(async () => {
                  const res = await saveQuestionAction(bank.id, editing === 'new' ? null : editing.id, data);
                  if ('error' in res) toast.error(t('common.somethingWrong'));
                  else {
                    setEditing(null);
                    router.refresh();
                  }
                })
              }
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function QuestionForm({
  initial,
  pending,
  onSave,
}: {
  initial: QBQuestion | null;
  pending: boolean;
  onSave: (q: { type: QuestionType; text: string; difficulty: number; options: QBQuestion['options']; answers?: string[] }) => void;
}) {
  const t = useTranslations();
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'single');
  const [text, setText] = useState(initial?.text ?? '');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 1);
  const [options, setOptions] = useState<QBQuestion['options']>(
    initial?.options.length ? initial.options : [{ text: '', isCorrect: true, matchText: null }, { text: '', isCorrect: false, matchText: null }],
  );
  const [answers, setAnswers] = useState((initial?.answers ?? []).join('\n'));
  const setOpt = (i: number, patch: Partial<QBQuestion['options'][number]>) => setOptions((os) => os.map((o, k) => (k === i ? { ...o, ...patch } : type === 'single' && patch.isCorrect ? { ...o, isCorrect: false } : o)));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          type,
          text,
          difficulty,
          options: type === 'short' ? [] : options.filter((o) => o.text.trim()).map((o) => ({ ...o, matchText: type === 'matching' ? (o.matchText ?? '') : null })),
          answers: type === 'short' ? answers.split('\n').map((a) => a.trim()).filter(Boolean) : undefined,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('studio.questions.type')}>
          <Select value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`enums.questionType.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('studio.questions.difficulty')}>
          <Select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </Select>
        </Field>
      </div>
      <Field label={t('studio.questions.question')}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} required />
      </Field>
      {type === 'short' ? (
        <Field label={t('studio.questions.answers')}>
          <Textarea value={answers} onChange={(e) => setAnswers(e.target.value)} required />
        </Field>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('studio.questions.options')}</p>
          {type === 'ordering' && <p className="text-xs text-fg-muted">{t('studio.questions.orderNote')}</p>}
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              {(type === 'single' || type === 'multiple') && (
                <input
                  type={type === 'single' ? 'radio' : 'checkbox'}
                  checked={o.isCorrect}
                  onChange={(e) => setOpt(i, { isCorrect: e.target.checked })}
                  aria-label={t('studio.questions.correct')}
                  className="size-5 shrink-0 accent-[var(--success)]"
                />
              )}
              <Input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={`${t('studio.questions.option')} ${i + 1}`} />
              {type === 'matching' && <Input value={o.matchText ?? ''} onChange={(e) => setOpt(i, { matchText: e.target.value })} placeholder={t('studio.questions.matchRight')} />}
              <Button size="icon-sm" variant="ghost" onClick={() => setOptions(options.filter((_, k) => k !== i))} aria-label={t('common.delete')} disabled={options.length <= 2}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {options.length < 10 && (
            <Button variant="ghost" size="sm" onClick={() => setOptions([...options, { text: '', isCorrect: false, matchText: null }])}>
              <Plus />
              {t('studio.questions.addOption')}
            </Button>
          )}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {t('common.save')}
      </Button>
    </form>
  );
}
