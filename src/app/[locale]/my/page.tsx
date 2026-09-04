import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/** Индекс кабинета обучающегося — собственной страницы нет, ведёт на главную кабинета. */
export default async function MyIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/dashboard`);
}
