'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { updateSettings } from '@/server/actions/admin';
import { SETTINGS } from '@/domain/constants';

/**
 * F-A-08. Настройки системы.
 * Раздел 4.2 ТЗ: значения хранятся в БД, а не в коде.
 */
export function SettingsForm({ values }: { values: Record<string, string> }) {
  const tc = useTranslations('common');
  const [state, setState] = useState(values);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      await updateSettings(state);
      setSaved(true);
    });
  }

  const admissionWeight = Number(state[SETTINGS.ADMISSION_WEIGHT] ?? 0.6);
  const examWeight = Number(state[SETTINGS.EXAM_WEIGHT] ?? 0.4);
  const weightsOk = Math.abs(admissionWeight + examWeight - 1) < 0.001;

  return (
    <div className="space-y-5">
      {saved && <Alert tone="success">{tc('saved')}</Alert>}

      <Card>
        <CardHeader><CardTitle>Учебный процесс</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <Alert tone="info">
            Один академический кредит равен 30 академическим часам (ГОСО, п. 29/56/102) —
            эта величина не настраивается. Продолжительность академического часа
            подлежит уточнению по действующей редакции Приказа № 152 (вопрос 14.2.1 ТЗ).
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Академический час, минут" hint="50 или 60 — по академической политике">
              <Select
                value={state[SETTINGS.ACADEMIC_HOUR_MINUTES] ?? '50'}
                onChange={(e) => set(SETTINGS.ACADEMIC_HOUR_MINUTES, e.target.value)}
              >
                <option value="50">50</option>
                <option value="60">60</option>
              </Select>
            </Field>

            <Field
              label="Допуск отклонения часов курса"
              hint="Академических часов; 0 — точное соответствие"
            >
              <Input
                type="number"
                step="0.5"
                min="0"
                value={state[SETTINGS.HOURS_TOLERANCE] ?? '0'}
                onChange={(e) => set(SETTINGS.HOURS_TOLERANCE, e.target.value)}
              />
            </Field>

            <Field
              label="Контроль нормативов по видам работы"
              hint="Соотношение контактных часов, СРОП и СРО (вопрос 14.2.2 ТЗ)"
            >
              <Select
                value={state[SETTINGS.ENFORCE_WORK_TYPE_NORMS] ?? 'false'}
                onChange={(e) => set(SETTINGS.ENFORCE_WORK_TYPE_NORMS, e.target.value)}
              >
                <option value="false">не контролировать</option>
                <option value="true">контролировать</option>
              </Select>
            </Field>

            <Field label="Согласование курса методистом" hint="Вопрос 14.2.9 ТЗ">
              <Select
                value={state[SETTINGS.REQUIRE_METHODIST_REVIEW] ?? 'true'}
                onChange={(e) => set(SETTINGS.REQUIRE_METHODIST_REVIEW, e.target.value)}
              >
                <option value="true">обязательно</option>
                <option value="false">не требуется</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Формула итоговой оценки</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <Alert tone={weightsOk ? 'info' : 'warning'}>
            Итоговый балл = рейтинг допуска × {admissionWeight} + экзамен × {examWeight}
            {!weightsOk && ' — сумма весов должна равняться 1.'}
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Число периодов рубежного контроля">
              <Select
                value={state[SETTINGS.MIDTERM_COUNT] ?? '2'}
                onChange={(e) => set(SETTINGS.MIDTERM_COUNT, e.target.value)}
              >
                <option value="1">1</option>
                <option value="2">2</option>
              </Select>
            </Field>
            <Field label="Вес рейтинга допуска">
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={state[SETTINGS.ADMISSION_WEIGHT] ?? '0.6'}
                onChange={(e) => set(SETTINGS.ADMISSION_WEIGHT, e.target.value)}
              />
            </Field>
            <Field label="Вес экзамена">
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={state[SETTINGS.EXAM_WEIGHT] ?? '0.4'}
                onChange={(e) => set(SETTINGS.EXAM_WEIGHT, e.target.value)}
              />
            </Field>
            <Field label="Порог допуска к экзамену, баллов">
              <Input
                type="number"
                min="0"
                max="100"
                value={state[SETTINGS.ADMISSION_THRESHOLD] ?? '50'}
                onChange={(e) => set(SETTINGS.ADMISSION_THRESHOLD, e.target.value)}
              />
            </Field>
            <Field label="Минимальный положительный балл">
              <Input
                type="number"
                min="0"
                max="100"
                value={state[SETTINGS.PASSING_SCORE] ?? '50'}
                onChange={(e) => set(SETTINGS.PASSING_SCORE, e.target.value)}
              />
            </Field>
            <Field label="Минимальный балл экзамена" hint="0 — не проверяется">
              <Input
                type="number"
                min="0"
                max="100"
                value={state[SETTINGS.EXAM_MIN_SCORE] ?? '0'}
                onChange={(e) => set(SETTINGS.EXAM_MIN_SCORE, e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Учёт активности</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Интервал сигнала активности, с">
              <Input
                type="number"
                min="10"
                max="120"
                value={state[SETTINGS.HEARTBEAT_INTERVAL_SEC] ?? '30'}
                onChange={(e) => set(SETTINGS.HEARTBEAT_INTERVAL_SEC, e.target.value)}
              />
            </Field>
            <Field label="Порог неактивности, мин">
              <Input
                type="number"
                min="1"
                max="60"
                value={state[SETTINGS.IDLE_TIMEOUT_MIN] ?? '5'}
                onChange={(e) => set(SETTINGS.IDLE_TIMEOUT_MIN, e.target.value)}
              />
            </Field>
            <Field
              label="Предел засчитываемого времени"
              hint="Доля плановой трудоёмкости, защита от накрутки"
            >
              <Input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={state[SETTINGS.MAX_COUNTED_RATIO] ?? '1.5'}
                onChange={(e) => set(SETTINGS.MAX_COUNTED_RATIO, e.target.value)}
              />
            </Field>
            <Field label="Порог просмотра видео, %">
              <Input
                type="number"
                min="1"
                max="100"
                value={state[SETTINGS.VIDEO_COMPLETION_PERCENT] ?? '80'}
                onChange={(e) => set(SETTINGS.VIDEO_COMPLETION_PERCENT, e.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Персональные данные и хранение</CardTitle></CardHeader>
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Версия формы согласия" hint="Изменение потребует повторного принятия">
              <Input
                value={state[SETTINGS.PDP_CONSENT_VERSION] ?? '1.0'}
                onChange={(e) => set(SETTINGS.PDP_CONSENT_VERSION, e.target.value)}
              />
            </Field>
            <Field label="Срок хранения данных отчисленных, лет" hint="Вопрос 14.2.8 ТЗ">
              <Input
                type="number"
                min="1"
                max="75"
                value={state[SETTINGS.RETENTION_YEARS_EXPELLED] ?? '5'}
                onChange={(e) => set(SETTINGS.RETENTION_YEARS_EXPELLED, e.target.value)}
              />
            </Field>
            <Field label="Максимальный размер файла, МБ">
              <Input
                type="number"
                min="1"
                max="100"
                value={state[SETTINGS.MAX_UPLOAD_MB] ?? '100'}
                onChange={(e) => set(SETTINGS.MAX_UPLOAD_MB, e.target.value)}
              />
            </Field>
            <Field label="Социальный GPA" hint="Вопрос 14.2.7 ТЗ — требуется утверждённая методика">
              <Select
                value={state[SETTINGS.SOCIAL_GPA_ENABLED] ?? 'false'}
                onChange={(e) => set(SETTINGS.SOCIAL_GPA_ENABLED, e.target.value)}
              >
                <option value="false">не рассчитывается</option>
                <option value="true">рассчитывается</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Button onClick={save} disabled={pending || !weightsOk}>
        {pending ? '…' : tc('save')}
      </Button>
    </div>
  );
}
