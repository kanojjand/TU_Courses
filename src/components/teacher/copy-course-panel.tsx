'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { copyFromCourse } from '@/server/actions/course-builder';

/**
 * F-T-03. Копирование содержания курса прошлого периода.
 *
 * Раздел 8.2 ТЗ: важнейшая функция для принятия платформы преподавателями,
 * поэтому вынесена на обзорную страницу курса, а не спрятана в конструкторе.
 */
export function CopyCoursePanel({
  targetCourseId,
  sources,
}: {
  targetCourseId: string;
  sources: { id: string; label: string }[];
}) {
  const t = useTranslations('teacher');
  const [source, setSource] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy() {
    if (!source) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await copyFromCourse(source, targetCourseId);
        setResult(
          `Скопировано: модулей — ${r.modules}, элементов — ${r.items}, вопросов — ${r.questions}.`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка копирования');
      }
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t('copyFromPrevious')}</CardTitle></CardHeader>
      <CardBody className="space-y-3">
        {result && <Alert tone="success">{result}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-sm text-fg-muted">
          Копируются модули, элементы содержания, силлабус, банк вопросов, тесты и задания.
          Регистрации, оценки и данные об активности не копируются.
        </p>

        <Field label="Курс-источник">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">— выберите период —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </Field>

        <Button size="sm" variant="outline" onClick={copy} disabled={!source || pending}>
          {pending ? 'Копирование…' : 'Скопировать содержание'}
        </Button>
      </CardBody>
    </Card>
  );
}
