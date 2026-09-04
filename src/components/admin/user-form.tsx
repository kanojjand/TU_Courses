'use client';

import { useState, useTransition } from 'react';
import { Copy, UserPlus } from 'lucide-react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { createUser } from '@/server/actions/admin';

export interface UserFormOptions {
  roles: { code: string; label: string }[];
  programs: { id: string; label: string }[];
  groups: { id: string; label: string; programId: string }[];
  departments: { id: string; label: string }[];
}

/** Роли, которым нужен профиль преподавателя (кафедра) */
const STAFF_ROLES = ['TEACHER', 'TUTOR', 'ADVISOR', 'METHODIST'];

const EMPTY = {
  lastNameRu: '',
  firstNameRu: '',
  middleNameRu: '',
  email: '',
  iin: '',
  roleCode: 'STUDENT',
  uiLanguage: 'RU',
  programId: '',
  groupId: '',
  studyYear: '1',
  departmentId: '',
  position: '',
  password: '',
};

/**
 * F-A-03. Создание учётной записи без импорта XLSX.
 *
 * Состав полей зависит от роли: обучающемуся нужна образовательная программа
 * и группа, сотруднику — кафедра. Без профиля роль остаётся нерабочей, поэтому
 * эти поля обязательны, а не «дополнительные».
 */
export function UserForm({ options }: { options: UserFormOptions }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; generated: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isStudent = form.roleCode === 'STUDENT';
  const isStaff = STAFF_ROLES.includes(form.roleCode);
  const groupsOfProgram = options.groups.filter((g) => g.programId === form.programId);

  function submit() {
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const result = await createUser({
        email: form.email,
        lastNameRu: form.lastNameRu,
        firstNameRu: form.firstNameRu,
        middleNameRu: form.middleNameRu || undefined,
        iin: form.iin || undefined,
        roleCode: form.roleCode as never,
        uiLanguage: form.uiLanguage as never,
        programId: isStudent ? form.programId : undefined,
        groupId: isStudent && form.groupId ? form.groupId : undefined,
        studyYear: Number(form.studyYear),
        departmentId: isStaff ? form.departmentId : undefined,
        position: isStaff && form.position ? form.position : undefined,
        password: form.password || undefined,
      });

      if (result.ok) {
        setCreated({ email: result.email, password: result.password, generated: result.generated });
        setForm(EMPTY);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => setOpen(true)}>
          <UserPlus size={16} aria-hidden /> Добавить пользователя
        </Button>
        {created && (
          <span className="text-sm text-success">
            Создан {created.email}
            {created.generated ? ` · пароль: ${created.password}` : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>Новый пользователь</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {created && (
          <Alert tone="success">
            <p className="font-medium">Учётная запись создана</p>
            <p className="mt-1">
              Вход: <span className="font-mono">{created.email}</span>
              <br />
              Пароль: <span className="font-mono">{created.password}</span>
            </p>
            <p className="mt-1 text-xs">
              {created.generated
                ? 'Пароль сгенерирован и показан один раз — передайте его пользователю. При первом входе система потребует его сменить.'
                : 'Пароль задан вручную.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                navigator.clipboard?.writeText(`${created.email} / ${created.password}`)
              }
            >
              <Copy size={14} aria-hidden /> Скопировать
            </Button>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Фамилия" required>
            <Input
              value={form.lastNameRu}
              onChange={(e) => set('lastNameRu', e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Имя" required>
            <Input
              value={form.firstNameRu}
              onChange={(e) => set('firstNameRu', e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Отчество">
            <Input
              value={form.middleNameRu}
              onChange={(e) => set('middleNameRu', e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="E-mail" required hint="Используется как логин">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="ИИН" hint="12 цифр, необязательно">
            <Input
              inputMode="numeric"
              maxLength={12}
              value={form.iin}
              onChange={(e) => set('iin', e.target.value.replace(/\D/g, ''))}
              autoComplete="off"
            />
          </Field>
          <Field label="Язык интерфейса">
            <Select value={form.uiLanguage} onChange={(e) => set('uiLanguage', e.target.value)}>
              <option value="KK">Қазақша</option>
              <option value="RU">Русский</option>
              <option value="EN">English</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Роль" required>
            <Select
              value={form.roleCode}
              onChange={(e) => {
                set('roleCode', e.target.value);
                set('programId', '');
                set('groupId', '');
                set('departmentId', '');
              }}
            >
              {options.roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          {isStudent && (
            <>
              <Field label="Образовательная программа" required>
                <Select
                  value={form.programId}
                  onChange={(e) => {
                    set('programId', e.target.value);
                    set('groupId', '');
                  }}
                >
                  <option value="">— выберите —</option>
                  {options.programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Группа" hint={form.programId ? undefined : 'Сначала выберите программу'}>
                <Select
                  value={form.groupId}
                  disabled={!form.programId}
                  onChange={(e) => set('groupId', e.target.value)}
                >
                  <option value="">— без группы —</option>
                  {groupsOfProgram.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {isStaff && (
            <>
              <Field label="Кафедра" required>
                <Select
                  value={form.departmentId}
                  onChange={(e) => set('departmentId', e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {options.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Должность" hint="По умолчанию «Преподаватель»">
                <Input
                  value={form.position}
                  onChange={(e) => set('position', e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {isStudent && (
            <Field label="Курс обучения">
              <Select value={form.studyYear} onChange={(e) => set('studyYear', e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Пароль" hint="Оставьте пустым — сгенерируется автоматически">
            <Input
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Создание…' : 'Создать'}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Закрыть
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
