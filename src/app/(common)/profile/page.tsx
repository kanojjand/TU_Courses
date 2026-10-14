import { eq } from 'drizzle-orm';
import { getLocale, getTranslations } from 'next-intl/server';
import { A11yToggle } from '@/components/shell/a11y-toggle';
import { LocaleSwitcher } from '@/components/shell/locale-switcher';
import { PasswordForm } from '@/components/shell/password-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { departments, staff, students, studyGroups } from '@/db/schema';
import { pickName } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { rolesOf } from '@/lib/rbac';
import { fullName } from '@/lib/utils';

export default async function ProfilePage() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const [[st], [sf]] = await Promise.all([
    db.select({ s: students, g: studyGroups }).from(students).leftJoin(studyGroups, eq(studyGroups.id, students.groupId)).where(eq(students.userId, user.id)),
    db.select({ s: staff, d: departments }).from(staff).leftJoin(departments, eq(departments.id, staff.departmentId)).where(eq(staff.userId, user.id)),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('admin.profile.title')} />
      <Card>
        <CardHeader title={fullName(user)} description={user.login} />
        <CardBody className="space-y-2 text-sm">
          {user.email && <p>Email: {user.email}</p>}
          {st && (
            <p>
              {t('common.group')}: <b>{st.g?.code ?? '—'}</b> · {t('common.courseYear')}: {st.s.courseYear} · {t(`enums.studyForm.${st.s.studyForm}`)} · {t(`statuses.student.${st.s.status}`)}
            </p>
          )}
          {sf?.d && (
            <p>
              {t('common.department')}: <b>{pickName(sf.d, locale)}</b> {sf.s.position ? `· ${sf.s.position}` : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {rolesOf(user).map((r) => (
              <Badge key={r} tone="brand">
                {t(`roles.${r}`)}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('admin.profile.settings')} />
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-fg-muted">{t('admin.profile.interfaceLanguage')}</span>
          <LocaleSwitcher />
          <A11yToggle withLabel className="border border-border" />
        </CardBody>
      </Card>
      <Card id="password">
        <CardHeader title={t('admin.profile.password')} description={user.mustChangePassword ? t('auth.changePasswordHint') : undefined} />
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
