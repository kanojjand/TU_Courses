'use client';

import { useEffect, useState, useTransition } from 'react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { setQuizQuestions, updateQuizSettings } from '@/server/actions/quiz';
import { listBankQuestions, listQuizQuestions } from '@/server/actions/question-queries';

/** F-T-09. Конструктор теста: отбор вопросов, время, попытки, метод подсчёта. */
export function QuizSettings({ courseId, quizId }: { courseId: string; quizId: string }) {
  const [bank, setBank] = useState<
    { id: string; text: string; type: string; difficulty: string; topic: string | null; defaultPoints: number }[]
  >([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState({
    timeLimitMin: '',
    maxAttempts: '1',
    gradingMethod: 'HIGHEST',
    passingScore: '50',
    shuffleQuestions: true,
    shuffleOptions: true,
    showResultImmediately: true,
    showCorrectAnswers: false,
    randomSelection: false,
    randomCount: '',
  });
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const [questions, current] = await Promise.all([
        listBankQuestions(courseId),
        listQuizQuestions(quizId),
      ]);
      setBank(questions);
      setSelected(Object.fromEntries(current.questions.map((q) => [q.questionId, q.points])));
      setSettings({
        timeLimitMin: current.settings.timeLimitMin?.toString() ?? '',
        maxAttempts: String(current.settings.maxAttempts),
        gradingMethod: current.settings.gradingMethod,
        passingScore: String(current.settings.passingScore),
        shuffleQuestions: current.settings.shuffleQuestions,
        shuffleOptions: current.settings.shuffleOptions,
        showResultImmediately: current.settings.showResultImmediately,
        showCorrectAnswers: current.settings.showCorrectAnswers,
        randomSelection: current.settings.randomSelection,
        randomCount: current.settings.randomCount?.toString() ?? '',
      });
    })();
  }, [courseId, quizId]);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateQuizSettings({
        quizId,
        timeLimitMin: settings.timeLimitMin ? Number(settings.timeLimitMin) : null,
        maxAttempts: Number(settings.maxAttempts),
        gradingMethod: settings.gradingMethod as 'HIGHEST' | 'LAST' | 'AVERAGE' | 'FIRST',
        passingScore: Number(settings.passingScore),
        shuffleQuestions: settings.shuffleQuestions,
        shuffleOptions: settings.shuffleOptions,
        showResultImmediately: settings.showResultImmediately,
        showCorrectAnswers: settings.showCorrectAnswers,
        randomSelection: settings.randomSelection,
        randomCount: settings.randomCount ? Number(settings.randomCount) : null,
      });
      await setQuizQuestions(
        quizId,
        Object.entries(selected).map(([questionId, points]) => ({ questionId, points }))
      );
      setSaved(true);
    });
  }

  const totalPoints = Object.values(selected).reduce((s, p) => s + p, 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Параметры теста</CardTitle>
        <Badge tone="brand">
          {Object.keys(selected).length} вопросов · {totalPoints} баллов
        </Badge>
      </CardHeader>
      <CardBody className="space-y-5">
        {saved && <Alert tone="success">Параметры теста сохранены.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Ограничение времени, мин" hint="Пусто — без ограничения">
            <Input
              type="number"
              min="1"
              value={settings.timeLimitMin}
              onChange={(e) => setSettings({ ...settings, timeLimitMin: e.target.value })}
            />
          </Field>
          <Field label="Число попыток">
            <Input
              type="number"
              min="1"
              max="10"
              value={settings.maxAttempts}
              onChange={(e) => setSettings({ ...settings, maxAttempts: e.target.value })}
            />
          </Field>
          <Field label="Итог по попыткам">
            <Select
              value={settings.gradingMethod}
              onChange={(e) => setSettings({ ...settings, gradingMethod: e.target.value })}
            >
              <option value="HIGHEST">Лучшая попытка</option>
              <option value="LAST">Последняя попытка</option>
              <option value="FIRST">Первая попытка</option>
              <option value="AVERAGE">Среднее по попыткам</option>
            </Select>
          </Field>
          <Field label="Проходной балл, %">
            <Input
              type="number"
              min="0"
              max="100"
              value={settings.passingScore}
              onChange={(e) => setSettings({ ...settings, passingScore: e.target.value })}
            />
          </Field>
        </div>

        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">Поведение теста</legend>
          {(
            [
              ['shuffleQuestions', 'Случайный порядок вопросов'],
              ['shuffleOptions', 'Случайный порядок вариантов ответа'],
              ['showResultImmediately', 'Показывать результат сразу'],
              ['showCorrectAnswers', 'Показывать верные ответы после проверки'],
              ['randomSelection', 'Случайная выборка вопросов из банка'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {settings.randomSelection && (
          <Field label="Сколько вопросов выбирать случайно" required>
            <Input
              type="number"
              min="1"
              className="max-w-40"
              value={settings.randomCount}
              onChange={(e) => setSettings({ ...settings, randomCount: e.target.value })}
            />
          </Field>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Вопросы теста</p>
          {bank.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Банк вопросов пуст. Добавьте вопросы в разделе «Банк вопросов».
            </p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2">
              {bank.map((q) => {
                const checked = q.id in selected;
                return (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = { ...selected };
                        if (e.target.checked) next[q.id] = q.defaultPoints;
                        else delete next[q.id];
                        setSelected(next);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{q.text}</span>
                    <Badge className="shrink-0">{q.type}</Badge>
                    <Badge className="shrink-0">{q.difficulty}</Badge>
                    {checked && (
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="h-7 w-20 shrink-0"
                        value={selected[q.id]}
                        aria-label={`Балл за вопрос: ${q.text.slice(0, 40)}`}
                        onChange={(e) =>
                          setSelected({ ...selected, [q.id]: Number(e.target.value) })
                        }
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? '…' : 'Сохранить параметры теста'}
        </Button>
      </CardBody>
    </Card>
  );
}
