import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';

import { requireUser } from '@/server/guards';
import { adminSectionsFor, hasRole } from '@/lib/rbac';
import { AdminNav } from '@/components/admin/admin-nav';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('errors');
  const sections = adminSectionsFor(user);

  if (sections.length === 0 && !hasRole(user, 'METHODIST')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState title={t('forbiddenTitle')} description={t('forbiddenText')} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <AdminNav sections={sections} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
