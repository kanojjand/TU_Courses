'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { adminSectionsFor } from '@/lib/rbac';
import type { RoleCode } from '@/lib/rbac';

/**
 * Действие на публичной карточке курса.
 *
 * Страница курса кешируется (revalidate), поэтому состояние сессии читается
 * на клиенте: серверная отрисовка сделала бы кеш общим для гостя и вошедшего.
 * Раньше кнопка всегда вела на /login, и вошедшего пользователя оттуда
 * перебрасывало в его кабинет — выглядело как сбой.
 */
export function CourseCta() {
  const { data: session, status } = useSession();
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  if (status === 'loading') {
    return (
      <div className="pt-2">
        <Button className="w-full" disabled>
          &nbsp;
        </Button>
      </div>
    );
  }

  const roles = (session?.user?.roles ?? []) as RoleCode[];
  const has = (...r: RoleCode[]) => r.some((x) => roles.includes(x));

  if (!session?.user) {
    return (
      <Link href="/login" className="block pt-2">
        <Button className="w-full">{tc('login')}</Button>
      </Link>
    );
  }

  // Обучающийся записывается на дисциплину не из каталога, а через ИУП:
  // сначала план на год, согласование эдвайзером, и только потом выбор
  // потока. Кнопка «записаться» здесь обманывала бы порядок (F-IEP-01…07)
  if (has('STUDENT')) {
    return (
      <div className="space-y-2 pt-2">
        <Link href="/my/iep" className="block">
          <Button className="w-full">Мой учебный план</Button>
        </Link>
        <p className="text-xs text-fg-muted">
          Запись на дисциплину идёт через индивидуальный учебный план: выбираете
          дисциплины на год, эдвайзер согласовывает, после этого открывается выбор
          потока.
        </p>
      </div>
    );
  }

  if (has('TEACHER', 'TUTOR')) {
    return (
      <Link href="/teach" className="block pt-2">
        <Button className="w-full" variant="outline">
          {t('teach')}
        </Button>
      </Link>
    );
  }

  if (has('ADVISOR')) {
    return (
      <Link href="/advisor" className="block pt-2">
        <Button className="w-full" variant="outline">
          {t('advisees')}
        </Button>
      </Link>
    );
  }

  // Административные роли: первый доступный им раздел, как и после входа
  const [section] = adminSectionsFor({ roles });
  return (
    <Link href={section ? `/admin/${section}` : '/my/chats'} className="block pt-2">
      <Button className="w-full" variant="outline">
        {section ? t('admin') : t('chats')}
      </Button>
    </Link>
  );
}
