import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { requireUser } from '@/server/guards';
import { adminSectionsFor } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/**
 * Индекс административной части. Собственного содержимого не имеет —
 * ведёт в первый раздел, доступный роли (порядок задаёт adminSectionsFor).
 *
 * Ролям без единого доступного раздела layout показывает «Доступ запрещён»
 * и не отрисовывает children, поэтому редирект здесь не сработает — это
 * ожидаемое поведение.
 */
export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const [first] = adminSectionsFor(user);

  redirect(`/${locale}/admin/${first ?? 'gradesheets'}`);
}
