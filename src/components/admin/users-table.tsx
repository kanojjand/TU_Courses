'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Download, KeyRound, Lock, Unlock, Upload } from 'lucide-react';

import { usePathname, useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { resetUserPassword, setUserStatus } from '@/server/actions/admin';
import { importUsersFromFile } from '@/server/actions/import';
import { fmtDateTime } from '@/lib/utils';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  iin: string;
  status: string;
  roles: string[];
  group: string | null;
  program: string | null;
  department: string | null;
  lastLoginAt: string | null;
}

/** F-A-03. Управление пользователями и импорт из XLSX (критерий приёмки № 11). */
export function UsersTable({
  users,
  roleOptions,
  canManage,
}: {
  users: AdminUser[];
  roleOptions: { code: string; label: string }[];
  canManage: boolean;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; name: string }[]>([]);
  const [pending, startTransition] = useTransition();

  function filter(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  function upload(file: File | null) {
    if (!file) return;
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', file);
      try {
        const result = await importUsersFromFile(fd);
        setCredentials(result.data ?? []);
        setMessage({
          tone: result.issues.length ? 'danger' : 'success',
          text:
            `Обработано строк: ${result.total}. Создано: ${result.created}, обновлено: ${result.updated}, пропущено: ${result.skipped}.` +
            (result.issues.length
              ? ` Ошибки: ${result.issues.slice(0, 5).map((i) => `строка ${i.row} — ${i.message}`).join('; ')}`
              : ''),
        });
      } catch (e) {
        setMessage({ tone: 'danger', text: e instanceof Error ? e.message : tc('error') });
      }
    });
  }

  function downloadCredentials() {
    const csv = [
      'ФИО;E-mail;Временный пароль',
      ...credentials.map((c) => `${c.name};${c.email};${c.password}`),
    ].join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Временные_пароли.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {credentials.length > 0 && (
        <Alert tone="warning" title="Временные пароли созданных учётных записей">
          <p className="mb-2 text-sm">
            Пароли показываются один раз. Сохраните файл и передайте пользователям по защищённому
            каналу. При первом входе система потребует сменить пароль.
          </p>
          <Button size="sm" variant="outline" onClick={downloadCredentials}>
            <Download size={14} aria-hidden /> Скачать CSV
          </Button>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Всего: {users.length}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <a href="/api/templates/users" download>
              <Button size="sm" variant="ghost">
                <Download size={14} aria-hidden /> Шаблон XLSX
              </Button>
            </a>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
              <Upload size={14} aria-hidden /> {t('importUsers')}
              <input
                type="file"
                accept=".xlsx"
                className="sr-only"
                disabled={pending}
                onChange={(e) => upload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </CardHeader>

        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Input
              className="max-w-64"
              placeholder="Поиск по ФИО или e-mail"
              defaultValue={sp.get('q') ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') filter('q', (e.target as HTMLInputElement).value);
              }}
            />
            <Select
              className="max-w-56"
              value={sp.get('role') ?? ''}
              onChange={(e) => filter('role', e.target.value)}
            >
              <option value="">Все роли</option>
              {roleOptions.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </Select>
          </div>

          {users.length === 0 ? (
            <EmptyState title={tc('empty')} />
          ) : (
            <div className="scroll-x max-h-[70vh] overflow-y-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>E-mail</th>
                    <th>ИИН</th>
                    <th>Роли</th>
                    <th>Группа / кафедра</th>
                    <th>Последний вход</th>
                    <th>Статус</th>
                    {canManage && <th>{tc('actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="whitespace-normal font-medium">{u.fullName}</td>
                      <td className="text-fg-muted">{u.email}</td>
                      <td className="tabular-nums text-fg-muted">{u.iin}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r} tone="brand">
                              {roleOptions.find((o) => o.code === r)?.label ?? r}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="text-fg-muted">
                        {u.group ?? u.department ?? '—'}
                        {u.program && ` · ${u.program}`}
                      </td>
                      <td className="text-fg-muted">{fmtDateTime(u.lastLoginAt)}</td>
                      <td>
                        <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                          {u.status === 'ACTIVE' ? 'активен' : 'заблокирован'}
                        </Badge>
                      </td>
                      {canManage && (
                        <td>
                          <span className="flex gap-1">
                            <button
                              type="button"
                              title={u.status === 'ACTIVE' ? t('blockUser') : 'Разблокировать'}
                              aria-label={u.status === 'ACTIVE' ? t('blockUser') : 'Разблокировать'}
                              className="p-1 text-fg-muted hover:text-danger"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  await setUserStatus(u.id, u.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE');
                                  router.refresh();
                                })
                              }
                            >
                              {u.status === 'ACTIVE' ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                            <button
                              type="button"
                              title={t('resetPassword')}
                              aria-label={t('resetPassword')}
                              className="p-1 text-fg-muted hover:text-brand"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const password = await resetUserPassword(u.id);
                                  setCredentials([
                                    { email: u.email, password, name: u.fullName },
                                  ]);
                                  setMessage({
                                    tone: 'success',
                                    text: `Пароль сброшен. Временный пароль для ${u.email}: ${password}`,
                                  });
                                })
                              }
                            >
                              <KeyRound size={14} />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
