import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { requireUser } from '@/server/guards';
import { getConsentVersion } from '@/server/settings';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { ConsentForm } from '@/components/auth/consent-form';

/**
 * F-S-02. Обязательное принятие согласия на обработку персональных данных
 * при первом входе с фиксацией даты и версии документа.
 */
export default async function ConsentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  if (user.hasConsent) redirect(`/${locale}/dashboard`);

  const t = await getTranslations('consent');
  const version = await getConsentVersion();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t('intro')}</p>

      <Card className="mt-6">
        <CardBody className="prose-lesson max-h-96 overflow-y-auto text-sm">
          <p>
            Я, {user.name}, даю согласие на сбор и обработку моих персональных данных
            в информационной системе вуза в целях организации и обеспечения учебного процесса.
          </p>
          <p>Согласие распространяется на следующие данные:</p>
          <ul>
            <li>индивидуальный идентификационный номер (ИИН);</li>
            <li>фамилия, имя, отчество;</li>
            <li>адрес электронной почты и номер телефона;</li>
            <li>сведения об образовательной программе, группе, форме и языке обучения;</li>
            <li>сведения об успеваемости, результатах контроля и учебной активности.</li>
          </ul>
          <p>
            Обработка включает сбор, запись, хранение, изменение, использование, передачу
            в информационную систему уполномоченного органа в области образования и обезличивание.
          </p>
          <p>
            Я уведомлён(а), что согласие может быть отозвано путём направления письменного
            обращения оператору, и что отзыв согласия может повлечь невозможность продолжения
            обучения с применением дистанционных образовательных технологий.
          </p>
          <p>
            Полный текст политики обработки персональных данных доступен на{' '}
            <Link href="/privacy">отдельной странице</Link>.
          </p>
        </CardBody>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-muted">
            {t('version')}: {version}
          </span>
          <ConsentForm locale={locale} version={version} />
        </CardFooter>
      </Card>
    </div>
  );
}
