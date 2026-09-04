'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { finishAttempt, saveAnswer } from '@/server/actions/quiz';
import type { AnswerResponse } from '@/domain/quiz';

export interface RunnerQuestion {
  id: string;
  type: 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'MATCHING' | 'ORDERING' | 'SHORT_ANSWER' | 'TRUE_FALSE';
  text: string;
  points: number;
  options: { id: string; text: string }[];
  matchPool: string[];
  savedResponse: Record<string, unknown> | null;
}

/**
 * F-S-07. Прохождение теста: ограничение по времени, сохранение
 * промежуточного состояния при обрыве связи, шесть типов вопросов.
 */
export function QuizRunner({
  attemptId,
  courseId,
  title,
  questions,
  expiresAt,
  showResultImmediately,
}: {
  attemptId: string;
  courseId: string;
  title: string;
  questions: RunnerQuestion[];
  expiresAt: string | null;
  showResultImmediately: boolean;
}) {
  const t = useTranslations('student');
  const [responses, setResponses] = useState<Record<string, AnswerResponse>>(() => {
    const init: Record<string, AnswerResponse> = {};
    for (const q of questions) {
      if (q.savedResponse) init[q.id] = q.savedResponse as AnswerResponse;
    }
    return init;
  });
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; maxScore: number; percent: number; passed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await finishAttempt(attemptId);
      if (showResultImmediately) setResult(res);
      else window.location.href = `/my/courses/${courseId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки');
      setSubmitting(false);
    }
  }, [attemptId, courseId, showResultImmediately]);

  // Отсчёт оставшегося времени; по истечении попытка завершается автоматически
  useEffect(() => {
    if (!expiresAt) return;
    const deadline = new Date(expiresAt).getTime();

    function tick() {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) void submit();
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, submit]);

  /** Ответ сохраняется сразу — при обрыве связи он не теряется */
  function update(questionId: string, response: AnswerResponse) {
    setResponses((prev) => ({ ...prev, [questionId]: response }));
    void saveAnswer(attemptId, questionId, response).catch(() => {});
  }

  const answered = questions.filter((q) => responses[q.id]).length;

  if (result) {
    return (
      <Card>
        <CardHeader><CardTitle>{t('quizResult')}</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <Alert tone={result.passed ? 'success' : 'warning'}>
            <p className="text-lg font-semibold">
              {result.score} из {result.maxScore} ({result.percent} %)
            </p>
            <p className="mt-1 text-sm">
              {result.passed ? 'Тест пройден.' : 'Проходной балл не набран.'}
            </p>
          </Alert>
          <Button onClick={() => (window.location.href = `/my/courses/${courseId}`)}>
            Вернуться к курсу
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="sticky top-14 z-30 -mx-4 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{title}</h1>
          {remaining !== null && (
            <Badge tone={remaining < 300 ? 'danger' : 'brand'}>
              {t('timeLeft')}: {Math.floor(remaining / 60)}:
              {String(remaining % 60).padStart(2, '0')}
            </Badge>
          )}
        </div>
        <Progress
          className="mt-2"
          value={(answered / questions.length) * 100}
          label={`Отвечено ${answered} из ${questions.length}`}
        />
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id}>
            <Card>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-relaxed">
                    <span className="mr-2 text-fg-muted">{i + 1}.</span>
                    {q.text}
                  </p>
                  <Badge className="shrink-0">{q.points} б.</Badge>
                </div>
                <QuestionInput question={q} response={responses[q.id] ?? null} onChange={update} />
              </CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-sm text-fg-muted">
          Отвечено {answered} из {questions.length}
        </p>
        <Button onClick={submit} disabled={submitting} size="lg">
          {submitting ? '…' : t('submitQuiz')}
        </Button>
      </div>
    </div>
  );
}

function QuestionInput({
  question: q,
  response,
  onChange,
}: {
  question: RunnerQuestion;
  response: AnswerResponse;
  onChange: (id: string, r: AnswerResponse) => void;
}) {
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE': {
      const selected = response && 'optionIds' in response ? response.optionIds[0] : null;
      return (
        <fieldset className="space-y-2">
          <legend className="sr-only">Выберите один вариант</legend>
          {q.options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <input
                type="radio"
                name={q.id}
                className="mt-0.5"
                checked={selected === o.id}
                onChange={() => onChange(q.id, { optionIds: [o.id] })}
              />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }

    case 'MULTI_CHOICE': {
      const selected = new Set(response && 'optionIds' in response ? response.optionIds : []);
      return (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs text-fg-muted">Выберите все верные варианты</legend>
          {q.options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(o.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.id);
                  else next.delete(o.id);
                  onChange(q.id, { optionIds: [...next] });
                }}
              />
              <span>{o.text}</span>
            </label>
          ))}
        </fieldset>
      );
    }

    case 'MATCHING': {
      const pairs = response && 'pairs' in response ? response.pairs : {};
      return (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">Установите соответствие</p>
          {q.options.map((o) => (
            <div key={o.id} className="grid gap-2 sm:grid-cols-2 sm:items-center">
              <span className="text-sm">{o.text}</span>
              <Select
                value={pairs[o.id] ?? ''}
                onChange={(e) => onChange(q.id, { pairs: { ...pairs, [o.id]: e.target.value } })}
              >
                <option value="">— выберите —</option>
                {q.matchPool.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      );
    }

    case 'ORDERING': {
      const order = response && 'order' in response ? response.order : q.options.map((o) => o.id);
      const ordered = order
        .map((id) => q.options.find((o) => o.id === id))
        .filter((o): o is { id: string; text: string } => Boolean(o));

      function move(index: number, delta: number) {
        const next = [...ordered];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(q.id, { order: next.map((o) => o.id) });
      }

      return (
        <ol className="space-y-2">
          <p className="text-xs text-fg-muted">Установите правильную последовательность</p>
          {ordered.map((o, i) => (
            <li
              key={o.id}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="w-5 shrink-0 text-fg-muted">{i + 1}.</span>
              <span className="flex-1">{o.text}</span>
              <button
                type="button"
                aria-label="Переместить выше"
                className="px-1.5 text-fg-muted hover:text-fg disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Переместить ниже"
                className="px-1.5 text-fg-muted hover:text-fg disabled:opacity-30"
                disabled={i === ordered.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      );
    }

    case 'SHORT_ANSWER': {
      const text = response && 'text' in response ? response.text : '';
      return (
        <Input
          value={text}
          placeholder="Введите ответ"
          onChange={(e) => onChange(q.id, { text: e.target.value })}
          aria-label="Ответ"
        />
      );
    }
  }
}
