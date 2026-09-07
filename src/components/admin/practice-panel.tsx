'use client';

import { useState, useTransition } from 'react';
import { Building2, Plus, UserPlus } from 'lucide-react';

import { useRouter } from '@/i18n/routing';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/alert';
import {
  PRACTICE_KIND_LABELS,
  PLACEMENT_STATUS_LABELS,
  type PracticeKindCode,
  type PlacementStatusCode,
} from '@/domain/attestation';
import { savePracticeBase, savePlacement, setPlacementStatus } from '@/server/actions/attestation';

export interface BaseRow {
  id: string;
  nameRu: string;
  bin: string | null;
  address: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  profileNote: string | null;
  capacity: number | null;
  occupied: number;
  freeCapacity: number | null;
  contractNo: string | null;
  contractFrom: string | null;
  contractTo: string | null;
  isActive: boolean;
}

export interface PlacementRow {
  id: string;
  studentName: string;
  groupName: string | null;
  hasMinor: boolean;
  kind: string;
  baseName: string | null;
  startsOn: string;
  endsOn: string;
  credits: number;
  status: string;
  isMajorProfile: boolean;
  supervisorName: string | null;
  supervisorBaseName: string | null;
  diaryCount: number;
  reportScore: number | null;
  reportLetter: string | null;
}

/** F-PRC-01…F-PRC-04. Базы практики и распределение обучающихся. */
export function PracticePanel({
  bases,
  placements,
  students,
  teachers,
}: {
  bases: BaseRow[];
  placements: PlacementRow[];
  students: { id: string; name: string; groupName: string | null; programCode: string }[];
  teachers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addingBase, setAddingBase] = useState(false);
  const [addingPlacement, setAddingPlacement] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<
      { ok: true; data?: { warnings?: string[] } } | { ok: false; error: string }
    >
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Предупреждения о профиле базы показываются, но действие не отменяют
      const warnings = result.data?.warnings ?? [];
      if (warnings.length > 0) setNotice(warnings.join(' '));
      setAddingBase(false);
      setAddingPlacement(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && (
        <Alert tone="warning" title="Распределение сохранено с замечанием">
          {notice}
        </Alert>
      )}

      {/* ── Базы практики (F-PRC-02) ────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Building2 size={16} className="text-fg-muted" aria-hidden />
            Базы практики ({bases.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddingBase((v) => !v)}>
            <Plus size={14} aria-hidden /> {addingBase ? 'Скрыть' : 'Добавить базу'}
          </Button>
        </CardHeader>

        {addingBase && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(() =>
                  savePracticeBase({
                    nameRu: String(fd.get('nameRu') ?? ''),
                    bin: String(fd.get('bin') ?? '') || undefined,
                    address: String(fd.get('address') ?? '') || undefined,
                    contactPerson: String(fd.get('contactPerson') ?? '') || undefined,
                    contactPhone: String(fd.get('contactPhone') ?? '') || undefined,
                    profileNote: String(fd.get('profileNote') ?? '') || undefined,
                    capacity: fd.get('capacity') ? Number(fd.get('capacity')) : undefined,
                    contractNo: String(fd.get('contractNo') ?? '') || undefined,
                    contractFrom: String(fd.get('contractFrom') ?? '') || undefined,
                    contractTo: String(fd.get('contractTo') ?? '') || undefined,
                    isActive: true,
                  })
                )
              }
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <Field label="Организация" required>
                <Input name="nameRu" required maxLength={300} />
              </Field>
              <Field label="БИН">
                <Input name="bin" maxLength={12} />
              </Field>
              <Field label="Адрес">
                <Input name="address" maxLength={500} />
              </Field>
              <Field
                label="Профиль организации"
                hint="По нему проверяется соответствие профилю Major"
              >
                <Input name="profileNote" maxLength={500} placeholder="школа, преподавание истории" />
              </Field>
              <Field label="Контактное лицо">
                <Input name="contactPerson" maxLength={200} />
              </Field>
              <Field label="Телефон">
                <Input name="contactPhone" maxLength={50} />
              </Field>
              <Field label="Вместимость" hint="Пусто — без ограничения">
                <Input name="capacity" type="number" min="1" max="1000" />
              </Field>
              <Field label="Договор №">
                <Input name="contractNo" maxLength={100} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Действует с">
                  <Input name="contractFrom" type="date" />
                </Field>
                <Field label="по">
                  <Input name="contractTo" type="date" />
                </Field>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Добавить
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {bases.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Баз практики нет"
                description="База практики — организация, с которой заключён договор о приёме обучающихся."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Организация</th>
                    <th>Профиль</th>
                    <th>Договор</th>
                    <th className="text-right">Мест</th>
                    <th className="text-right">Занято</th>
                    <th>Контакт</th>
                  </tr>
                </thead>
                <tbody>
                  {bases.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{b.nameRu}</span>
                        {!b.isActive && <Badge className="ml-2">договор закрыт</Badge>}
                        {b.address && (
                          <span className="block text-xs text-fg-muted">{b.address}</span>
                        )}
                      </td>
                      <td className="whitespace-normal text-xs">{b.profileNote ?? '—'}</td>
                      <td className="text-xs">
                        {b.contractNo ?? '—'}
                        {b.contractTo && (
                          <span className="block text-fg-muted">до {b.contractTo}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{b.capacity ?? '∞'}</td>
                      <td className="text-right tabular-nums">
                        <span
                          className={
                            b.freeCapacity != null && b.freeCapacity <= 0 ? 'text-danger' : ''
                          }
                        >
                          {b.occupied}
                        </span>
                      </td>
                      <td className="whitespace-normal text-xs">
                        {b.contactPerson ?? '—'}
                        {b.contactPhone && (
                          <span className="block text-fg-muted">{b.contactPhone}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Распределение (F-PRC-03) ────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <UserPlus size={16} className="text-fg-muted" aria-hidden />
            Распределение ({placements.length})
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddingPlacement((v) => !v)}>
            <Plus size={14} aria-hidden /> {addingPlacement ? 'Скрыть' : 'Распределить'}
          </Button>
        </CardHeader>

        {addingPlacement && (
          <CardBody className="border-b border-border">
            <form
              action={(fd) =>
                run(() =>
                  savePlacement({
                    studentId: String(fd.get('studentId') ?? ''),
                    baseId: String(fd.get('baseId') ?? '') || undefined,
                    kind: fd.get('kind') as PracticeKindCode,
                    startsOn: String(fd.get('startsOn') ?? ''),
                    endsOn: String(fd.get('endsOn') ?? ''),
                    credits: Number(fd.get('credits') ?? 0),
                    supervisorId: String(fd.get('supervisorId') ?? '') || undefined,
                    supervisorBaseName: String(fd.get('supervisorBaseName') ?? '') || undefined,
                    orderNo: String(fd.get('orderNo') ?? '') || undefined,
                  })
                )
              }
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field label="Обучающийся" required>
                <Select name="studentId" required>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.groupName ? ` · ${s.groupName}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Вид практики" required>
                <Select name="kind" defaultValue="EDUCATIONAL" required>
                  {Object.entries(PRACTICE_KIND_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="База практики">
                <Select name="baseId" defaultValue="">
                  <option value="">— не назначена —</option>
                  {bases
                    .filter((b) => b.isActive)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameRu}
                        {b.freeCapacity != null ? ` · свободно ${b.freeCapacity}` : ''}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Кредиты" required>
                <Input name="credits" type="number" step="0.5" min="0.5" max="60" required />
              </Field>
              <Field label="Начало" required>
                <Input name="startsOn" type="date" required />
              </Field>
              <Field label="Окончание" required>
                <Input name="endsOn" type="date" required />
              </Field>
              <Field label="Руководитель от вуза">
                <Select name="supervisorId" defaultValue="">
                  <option value="">— не назначен —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Руководитель от организации">
                <Input name="supervisorBaseName" maxLength={200} />
              </Field>
              <Field label="Приказ №">
                <Input name="orderNo" maxLength={100} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" disabled={pending}>
                  Распределить
                </Button>
              </div>
            </form>
          </CardBody>
        )}

        <CardBody className="p-0">
          {placements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Распределений нет"
                description="Распределите обучающихся на базы практики согласно учебному плану."
              />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Обучающийся</th>
                    <th>Вид</th>
                    <th>База</th>
                    <th>Сроки</th>
                    <th className="text-right">Кр</th>
                    <th className="text-right">Дневник</th>
                    <th>Оценка</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-normal">
                        <span className="font-medium">{p.studentName}</span>
                        {p.groupName && (
                          <span className="block text-xs text-fg-muted">{p.groupName}</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {PRACTICE_KIND_LABELS[p.kind as PracticeKindCode] ?? p.kind}
                      </td>
                      <td className="whitespace-normal text-xs">
                        {p.baseName ?? '—'}
                        {p.hasMinor && !p.isMajorProfile && (
                          <Badge tone="warning" className="ml-1">
                            профиль не совпал
                          </Badge>
                        )}
                        {p.supervisorName && (
                          <span className="block text-fg-muted">{p.supervisorName}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs tabular-nums">
                        {p.startsOn} — {p.endsOn}
                      </td>
                      <td className="text-right tabular-nums">{p.credits}</td>
                      <td className="text-right tabular-nums">{p.diaryCount}</td>
                      <td>
                        {p.reportLetter ? (
                          <Badge tone="success">
                            {p.reportLetter} · {p.reportScore}
                          </Badge>
                        ) : (
                          <span className="text-xs text-fg-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Select
                          aria-label={`Статус: ${p.studentName}`}
                          className="h-8 text-xs"
                          defaultValue={p.status}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              setPlacementStatus(p.id, e.target.value as PlacementStatusCode)
                            )
                          }
                        >
                          {Object.entries(PLACEMENT_STATUS_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </td>
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
