'use client';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { KAZAKH_SPECIFIC_CHARS } from '@/domain/constants';

/**
 * F-L-05. Самопроверка шрифта: специфические символы казахского алфавита
 * должны отображаться корректно в строчном и прописном начертании.
 * Соответствие проверяется визуально при выборе шрифта.
 */
export function FontCheck() {
  const pairs = [
    ['Ә', 'ә'], ['Ғ', 'ғ'], ['Қ', 'қ'], ['Ң', 'ң'],
    ['Ө', 'ө'], ['Ұ', 'ұ'], ['Ү', 'ү'], ['Һ', 'һ'], ['І', 'і'],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Проверка шрифта интерфейса (F-L-05)</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-fg-muted">
          Шрифт интерфейса обязан корректно отображать специфические символы казахского
          алфавита. Если ниже вместо буквы виден прямоугольник или подстановочный глиф —
          шрифт не подходит и подлежит замене в дизайн-токенах.
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {pairs.map(([upper, lower]) => (
            <div
              key={upper}
              className="rounded-lg border border-border py-3 text-center"
            >
              <p className="text-2xl leading-none">{upper}</p>
              <p className="mt-1 text-2xl leading-none">{lower}</p>
            </div>
          ))}
        </div>

        <p className="rounded-lg bg-muted px-3 py-2 text-lg">{KAZAKH_SPECIFIC_CHARS}</p>

        <p className="text-sm">
          Контрольная фраза:{' '}
          <span className="font-medium">
            Әрбір білім алушының үлгерімі — оқу үдерісінің негізгі көрсеткіші
          </span>
        </p>
      </CardBody>
    </Card>
  );
}
