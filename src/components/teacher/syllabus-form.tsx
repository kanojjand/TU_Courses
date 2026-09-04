'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea, Input, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { saveSyllabus } from '@/server/actions/course-builder';

/**
 * F-T-02. Силлабус.
 *
 * Состав разделов соответствует типовому шаблону; утверждённая вузом форма
 * запрашивается отдельно (п. 14.1.5 ТЗ) и заменяет набор полей ниже.
 */
export function SyllabusForm({
  courseId,
  credits,
  outcomes,
  initial,
}: {
  courseId: string;
  credits: number;
  outcomes: string | null;
  initial: {
    goals: string;
    competencies: string;
    policy: string;
    gradingCriteria: string;
    literature: string;
    officeHours: string;
    contactInfo: string;
  };
}) {
  const tc = useTranslations('common');
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveSyllabus({ courseId, ...state });
      setSaved(true);
    });
  }

  const field = (key: keyof typeof state) => ({
    value: state[key],
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      setState({ ...state, [key]: e.target.value }),
  });

  return (
    <div className="max-w-3xl space-y-4">
      {saved && <Alert tone="success">{tc('saved')}</Alert>}

      <Alert tone="info">
        Объём дисциплины: {credits} кредита ({credits * 30} академических часов).
        Тематический план формируется автоматически из модулей курса в конструкторе.
      </Alert>

      {outcomes && (
        <Card>
          <CardHeader><CardTitle>Результаты обучения по дисциплине</CardTitle></CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm text-fg-muted">{outcomes}</p>
            <p className="mt-2 text-xs text-fg-muted">
              Задаются в справочнике дисциплин и редактируются учебным отделом.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Содержание силлабуса</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <Field label="Цели дисциплины" hint="Чему научится обучающийся и зачем">
            <Textarea rows={4} {...field('goals')} />
          </Field>

          <Field label="Формируемые компетенции">
            <Textarea rows={4} {...field('competencies')} />
          </Field>

          <Field
            label="Критерии оценивания"
            hint="Распределение баллов по видам работ, требования к допуску"
          >
            <Textarea rows={5} {...field('gradingCriteria')} />
          </Field>

          <Field
            label="Политика курса"
            hint="Требования к посещаемости и участию, сроки сдачи, академическая честность"
          >
            <Textarea rows={5} {...field('policy')} />
          </Field>

          <Field label="Литература и источники">
            <Textarea rows={5} {...field('literature')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Часы консультаций">
              <Input {...field('officeHours')} placeholder="Вторник 14:00–16:00" />
            </Field>
            <Field label="Контакты для связи">
              <Input {...field('contactInfo')} placeholder="e-mail, мессенджер" />
            </Field>
          </div>

          <Button onClick={save} disabled={pending}>
            {pending ? '…' : tc('save')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
