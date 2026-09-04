'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Plus, Trash2, Upload } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { createQuestion, deleteQuestion, type QuestionInput } from '@/server/actions/questions';
import { importQuestionsFromFile } from '@/server/actions/import';

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: 'Один из нескольких',
  MULTI_CHOICE: 'Несколько из нескольких',
  MATCHING: 'Соответствие',
  ORDERING: 'Последовательность',
  SHORT_ANSWER: 'Короткий ответ',
  TRUE_FALSE: 'Верно / неверно',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: 'лёгкий',
  MEDIUM: 'средний',
  HARD: 'сложный',
};

export interface BankQuestion {
  id: string;
  type: string;
  difficulty: string;
  text: string;
  topic: string | null;
  points: number;
  optionCount: number;
  correctCount: number;
}

/** F-T-08. Банк вопросов: шесть типов вопросов, импорт из XLSX. */
export function QuestionBankPanel({
  courseId,
  topics,
  questions,
}: {
  courseId: string;
  topics: string[];
  questions: BankQuestion[];
}) {
  const t = useTranslations('teacher');
  const tc = useTranslations('common');

  const [type, setType] = useState<QuestionInput['type']>('SINGLE_CHOICE');
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean; matchKey: string }[]>([
    { text: '', isCorrect: true, matchKey: '' },
    { text: '', isCorrect: false, matchKey: '' },
  ]);
  const [filterTopic, setFilterTopic] = useState('');
  const [filterType, setFilterType] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const needsOptions = type !== 'SHORT_ANSWER';
  const isMatching = type === 'MATCHING';
  const isOrdering = type === 'ORDERING';
  const singleCorrect = type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE';

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        await createQuestion({
          courseId,
          type,
          topicName: String(formData.get('topic') ?? '') || undefined,
          difficulty: (formData.get('difficulty') as 'EASY' | 'MEDIUM' | 'HARD') ?? 'MEDIUM',
          text: String(formData.get('text') ?? ''),
          explanation: String(formData.get('explanation') ?? '') || undefined,
          defaultPoints: Number(formData.get('points') ?? 1),
          options: needsOptions
            ? options
                .filter((o) => o.text.trim())
                .map((o) => ({
                  text: o.text.trim(),
                  isCorrect: isMatching || isOrdering ? true : o.isCorrect,
                  matchKey: isMatching ? o.matchKey.trim() : null,
                }))
            : [],
          answers: !needsOptions
            ? String(formData.get('answers') ?? '')
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        });
        window.location.reload();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  function importFile(file: File | null) {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('courseId', courseId);
      try {
        const result = await importQuestionsFromFile(fd);
        setMessage({
          tone: result.issues.length ? 'danger' : 'success',
          text:
            `Импортировано вопросов: ${result.created}.` +
            (result.issues.length
              ? ` Ошибок: ${result.issues.length}. ${result.issues
                  .slice(0, 3)
                  .map((i) => `Строка ${i.row}: ${i.message}`)
                  .join('; ')}`
              : ''),
        });
        if (result.created > 0) setTimeout(() => window.location.reload(), 2500);
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  const filtered = questions.filter(
    (q) =>
      (!filterTopic || q.topic === filterTopic) && (!filterType || q.type === filterType)
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Вопросы ({filtered.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <a href="/api/templates/questions" download>
                <Button size="sm" variant="ghost">
                  <Download size={14} aria-hidden /> Шаблон XLSX
                </Button>
              </a>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
                <Upload size={14} aria-hidden /> {t('importQuestions')}
                <input
                  type="file"
                  accept=".xlsx"
                  className="sr-only"
                  disabled={pending}
                  onChange={(e) => importFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tc('filter')}>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">Все типы</option>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Тема">
                <Select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}>
                  <option value="">Все темы</option>
                  {topics.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="Банк вопросов пуст"
                description="Добавьте вопросы вручную или импортируйте из XLSX по шаблону."
              />
            ) : (
              <ul className="space-y-2">
                {filtered.map((q) => (
                  <li key={q.id} className="rounded-lg border border-border px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-relaxed">{q.text}</p>
                      <button
                        type="button"
                        aria-label="Удалить вопрос"
                        className="shrink-0 text-fg-muted hover:text-danger"
                        onClick={() => {
                          if (!confirm('Удалить вопрос из банка?')) return;
                          startTransition(async () => {
                            await deleteQuestion(q.id);
                            window.location.reload();
                          });
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="brand">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                      <Badge>{DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}</Badge>
                      <Badge>{q.points} б.</Badge>
                      {q.topic && <Badge>{q.topic}</Badge>}
                      {q.optionCount > 0 && (
                        <Badge>
                          {q.optionCount} вар. · верных {q.correctCount}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <aside>
        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>Новый вопрос</CardTitle></CardHeader>
          <CardBody>
            <form action={submit} className="space-y-3">
              <Field label="Тип вопроса" required>
                <Select
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as QuestionInput['type'];
                    setType(next);
                    setOptions(
                      next === 'TRUE_FALSE'
                        ? [
                            { text: 'Верно', isCorrect: true, matchKey: '' },
                            { text: 'Неверно', isCorrect: false, matchKey: '' },
                          ]
                        : [
                            { text: '', isCorrect: true, matchKey: '' },
                            { text: '', isCorrect: false, matchKey: '' },
                          ]
                    );
                  }}
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Текст вопроса" required>
                <Textarea name="text" rows={3} required />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Тема">
                  <Input name="topic" list="topics" />
                  <datalist id="topics">
                    {topics.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Балл">
                  <Input name="points" type="number" step="0.5" min="0.5" defaultValue="1" />
                </Field>
              </div>

              <Field label="Сложность">
                <Select name="difficulty" defaultValue="MEDIUM">
                  {Object.entries(DIFFICULTY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>

              {needsOptions ? (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-medium">
                    {isMatching
                      ? 'Пары соответствия'
                      : isOrdering
                        ? 'Элементы в правильном порядке'
                        : 'Варианты ответа'}
                  </legend>
                  {options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {!isMatching && !isOrdering && (
                        <input
                          type={singleCorrect ? 'radio' : 'checkbox'}
                          name={singleCorrect ? 'correct' : undefined}
                          checked={o.isCorrect}
                          aria-label={`Вариант ${i + 1} верный`}
                          onChange={(e) => {
                            const next = [...options];
                            if (singleCorrect) next.forEach((x, j) => (x.isCorrect = j === i));
                            else next[i].isCorrect = e.target.checked;
                            setOptions(next);
                          }}
                        />
                      )}
                      {isOrdering && <span className="w-5 text-sm text-fg-muted">{i + 1}.</span>}
                      <Input
                        value={o.text}
                        placeholder={isMatching ? 'Левая часть' : `Вариант ${i + 1}`}
                        aria-label={`Вариант ${i + 1}`}
                        onChange={(e) => {
                          const next = [...options];
                          next[i].text = e.target.value;
                          setOptions(next);
                        }}
                      />
                      {isMatching && (
                        <Input
                          value={o.matchKey}
                          placeholder="Правая часть"
                          aria-label={`Соответствие ${i + 1}`}
                          onChange={(e) => {
                            const next = [...options];
                            next[i].matchKey = e.target.value;
                            setOptions(next);
                          }}
                        />
                      )}
                      {options.length > 2 && (
                        <button
                          type="button"
                          aria-label="Убрать вариант"
                          className="shrink-0 text-fg-muted hover:text-danger"
                          onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                  {type !== 'TRUE_FALSE' && options.length < 8 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setOptions([...options, { text: '', isCorrect: false, matchKey: '' }])
                      }
                    >
                      <Plus size={14} aria-hidden /> Вариант
                    </Button>
                  )}
                </fieldset>
              ) : (
                <Field label="Допустимые ответы" hint="По одному в строке" required>
                  <Textarea name="answers" rows={3} required />
                </Field>
              )}

              <Field label="Пояснение" hint="Показывается после проверки">
                <Textarea name="explanation" rows={2} />
              </Field>

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? '…' : tc('add')}
              </Button>
            </form>
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
