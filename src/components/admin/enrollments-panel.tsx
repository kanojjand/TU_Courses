'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Plus, Upload, UserMinus, Users } from 'lucide-react';

import { usePathname, useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cancelEnrollment, createCourse, enrollGroup } from '@/server/actions/admin';
import { importEnrollmentsFromFile } from '@/server/actions/import';

interface Option { id: string; label: string }

export interface CourseRow {
  id: string;
  label: string;
  period: string;
  stream: string | null;
  status: string;
  teachers: string;
  enrolled: number;
}

/** F-A-04. Курсы, назначение преподавателей и регистрация обучающихся. */
export function EnrollmentsPanel({
  periods,
  disciplines,
  teachers,
  groups,
  courses,
  enrollments,
  selectedCourseId,
}: {
  periods: Option[];
  disciplines: Option[];
  teachers: Option[];
  groups: Option[];
  courses: CourseRow[];
  enrollments: { studentId: string; name: string; email: string; group: string; source: string }[];
  selectedCourseId: string | null;
}) {
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();

  const [creating, setCreating] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function create(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        const teacherIds = formData.getAll('teacherIds').map(String).filter(Boolean);
        await createCourse({
          disciplineId: String(formData.get('disciplineId') ?? ''),
          periodId: String(formData.get('periodId') ?? ''),
          streamName: String(formData.get('streamName') ?? '') || undefined,
          teacherIds,
        });
        window.location.reload();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  function addGroup() {
    if (!selectedCourseId || !groupId) return;
    startTransition(async () => {
      try {
        const count = await enrollGroup(selectedCourseId, groupId);
        setMessage({ tone: 'success', text: `Зарегистрировано обучающихся: ${count}.` });
        router.refresh();
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
      try {
        const r = await importEnrollmentsFromFile(fd);
        setMessage({
          tone: r.issues.length ? 'danger' : 'success',
          text:
            `Обработано: ${r.total}. Создано: ${r.created}, обновлено: ${r.updated}, пропущено: ${r.skipped}.` +
            (r.issues.length
              ? ` Ошибки: ${r.issues.slice(0, 5).map((i) => `строка ${i.row} — ${i.message}`).join('; ')}`
              : ''),
        });
        router.refresh();
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Курсы ({courses.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <a href="/api/templates/enrollments" download>
              <Button size="sm" variant="ghost">
                <Download size={14} aria-hidden /> Шаблон XLSX
              </Button>
            </a>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
              <Upload size={14} aria-hidden /> Импорт регистраций
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                disabled={pending}
                onChange={(e) => importFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
              <Plus size={14} aria-hidden /> Создать курс
            </Button>
          </div>
        </CardHeader>

        {creating && (
          <CardBody className="border-b border-border">
            <form action={create} className="grid gap-3 sm:grid-cols-2">
              <Field label="Дисциплина" required>
                <Select name="disciplineId" required>
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Академический период" required>
                <Select name="periodId" required>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Учебный поток" hint="Если дисциплина читается несколькими потоками">
                <Input name="streamName" placeholder="Поток А" />
              </Field>
              <Field label="Преподаватели" hint="Первый выбранный становится ведущим" required>
                <select
                  name="teacherIds"
                  multiple
                  required
                  size={5}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending}>{tc('create')}</Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {courses.length === 0 ? (
            <EmptyState title="Курсы не созданы" />
          ) : (
            <div className="scroll-x max-h-96 overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Дисциплина</th>
                    <th>Период</th>
                    <th>Поток</th>
                    <th>Преподаватели</th>
                    <th>Статус</th>
                    <th className="text-right">Зачислено</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr
                      key={c.id}
                      className={c.id === selectedCourseId ? 'bg-brand/8' : undefined}
                    >
                      <td className="whitespace-normal font-medium">{c.label}</td>
                      <td className="text-fg-muted">{c.period}</td>
                      <td className="text-fg-muted">{c.stream ?? '—'}</td>
                      <td className="whitespace-normal text-fg-muted">{c.teachers}</td>
                      <td>
                        <Badge tone={c.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">{c.enrolled}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            startTransition(() => router.replace(`${pathname}?course=${c.id}`))
                          }
                        >
                          <Users size={14} aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {selectedCourseId && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Зарегистрированные ({enrollments.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="h-8 max-w-56 text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">— выберите группу —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </Select>
              <Button size="sm" onClick={addGroup} disabled={!groupId || pending}>
                Зарегистрировать группу
              </Button>
            </div>
          </CardHeader>

          <CardBody className="p-0">
            {enrollments.length === 0 ? (
              <EmptyState title="На курс никто не зарегистрирован" />
            ) : (
              <div className="scroll-x max-h-96 overflow-y-auto">
                <table className="table-dense">
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Группа</th>
                      <th>E-mail</th>
                      <th>Источник</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.studentId}>
                        <td className="whitespace-normal">{e.name}</td>
                        <td className="text-fg-muted">{e.group}</td>
                        <td className="text-fg-muted">{e.email}</td>
                        <td><Badge>{e.source}</Badge></td>
                        <td>
                          <button
                            type="button"
                            aria-label="Отменить регистрацию"
                            className="p-1 text-fg-muted hover:text-danger"
                            disabled={pending}
                            onClick={() => {
                              if (!confirm(`Отменить регистрацию ${e.name}?`)) return;
                              startTransition(async () => {
                                await cancelEnrollment(selectedCourseId, e.studentId);
                                router.refresh();
                              });
                            }}
                          >
                            <UserMinus size={14} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
