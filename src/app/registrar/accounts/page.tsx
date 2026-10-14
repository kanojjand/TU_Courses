import { asc, eq, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { AccountsPanel } from '@/components/registrar/accounts-panel';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page';
import { db } from '@/db';
import { students, studyGroups, users } from '@/db/schema';

export default async function AccountsPage() {
  const t = await getTranslations('registrar.accounts');
  const rows = await db
    .select({
      id: studyGroups.id,
      code: studyGroups.code,
      total: sql<number>`count(${students.userId})::int`,
      missing: sql<number>`count(${students.userId}) filter (where ${users.passwordHash} is null)::int`,
    })
    .from(studyGroups)
    .leftJoin(students, eq(students.groupId, studyGroups.id))
    .leftJoin(users, eq(users.id, students.userId))
    .groupBy(studyGroups.id, studyGroups.code)
    .orderBy(asc(studyGroups.code));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Card className="p-5">
        <AccountsPanel groups={rows} />
      </Card>
    </div>
  );
}
