import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/server/guards';
import { maskIin, decryptIin } from '@/lib/crypto';
import { can, ROLE_LABELS, type RoleCode } from '@/lib/rbac';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PasswordForm } from '@/components/auth/password-form';
import { Link } from '@/i18n/routing';
import { fmtDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Профиль пользователя. ИИН отображается маскированным (раздел 6.3). */
export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const tc = await getTranslations('common');

  const record = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      studentProfile: {
        include: {
          program: true,
          group: true,
          advisor: { include: { user: { select: { lastNameRu: true, firstNameRu: true } } } },
        },
      },
      teacherProfile: { include: { department: true } },
      consents: { orderBy: { acceptedAt: 'desc' }, take: 1 },
    },
  });

  // Полный ИИН доступен только ролям с соответствующим правом
  let iin = '—';
  if (record.iinEncrypted) {
    try {
      const decrypted = decryptIin(record.iinEncrypted);
      iin = can(user, 'pd:view_full_iin') ? decrypted : maskIin(decrypted);
    } catch {
      iin = '••••••••••••';
    }
  }

  const lang = user.uiLanguage.toLowerCase() as 'kk' | 'ru' | 'en';
  const consent = record.consents[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{tc('profile')}</h1>

      <div className="mt-6 space-y-5">
        <Card>
          <CardHeader><CardTitle>Основные сведения</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-fg-muted">ФИО (kk)</dt>
                <dd>{[record.lastNameKk, record.firstNameKk, record.middleNameKk].filter(Boolean).join(' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">ФИО (ru)</dt>
                <dd>{[record.lastNameRu, record.firstNameRu, record.middleNameRu].filter(Boolean).join(' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">ФИО (en)</dt>
                <dd>{[record.firstNameEn, record.lastNameEn].filter(Boolean).join(' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">ИИН</dt>
                <dd className="tabular-nums">{iin}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">E-mail</dt>
                <dd>{record.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">Телефон</dt>
                <dd>{record.phone ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-fg-muted">Роли</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {user.roles.map((r) => (
                    <Badge key={r} tone="brand">{ROLE_LABELS[r as RoleCode]?.[lang] ?? r}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {record.studentProfile && (
          <Card>
            <CardHeader><CardTitle>Обучение</CardTitle></CardHeader>
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs text-fg-muted">Образовательная программа</dt>
                  <dd>{record.studentProfile.program.code} · {record.studentProfile.program.nameRu}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Группа</dt>
                  <dd>{record.studentProfile.group?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Курс</dt>
                  <dd>{record.studentProfile.studyYear}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Форма обучения</dt>
                  <dd>{record.studentProfile.studyForm}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Статус</dt>
                  <dd>{record.studentProfile.status}</dd>
                </div>
                {record.studentProfile.advisor && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-fg-muted">Эдвайзер</dt>
                    <dd>
                      {record.studentProfile.advisor.user.lastNameRu}{' '}
                      {record.studentProfile.advisor.user.firstNameRu}
                    </dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
        )}

        {record.teacherProfile && (
          <Card>
            <CardHeader><CardTitle>Преподавательская деятельность</CardTitle></CardHeader>
            <CardBody>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-fg-muted">Кафедра</dt>
                  <dd>{record.teacherProfile.department.nameRu}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Должность</dt>
                  <dd>{record.teacherProfile.position}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">Учёная степень</dt>
                  <dd>{record.teacherProfile.academicDegree ?? '—'}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Персональные данные</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {consent ? (
              <p>
                Согласие на обработку принято {fmtDate(consent.acceptedAt, locale)},
                версия документа {consent.version}.
              </p>
            ) : (
              <p className="text-warning">Согласие не зафиксировано.</p>
            )}
            <Link href="/privacy" className="inline-block text-brand hover:underline">
              Политика обработки персональных данных
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Смена пароля</CardTitle></CardHeader>
          <CardBody>
            <PasswordForm requireCurrent />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
