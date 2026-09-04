import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Printer } from 'lucide-react';

import { requireUser } from '@/server/guards';
import { loadTranscript } from '@/server/grades';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, gradeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { PrintButton } from '@/components/layout/print-button';
import { fmtGpa, fmtScore } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** F-S-09. Транскрипт за все периоды обучения. */
export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations('grades');

  if (!user.studentProfileId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState title="Профиль обучающегося не найден" />
      </div>
    );
  }

  const transcript = await loadTranscript(user.studentProfileId);
  const nameField = locale === 'kk' ? 'nameKk' : locale === 'en' ? 'nameEn' : 'nameRu';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Транскрипт</h1>
          <p className="mt-0.5 text-sm text-fg-muted">{user.name}</p>
        </div>
        <PrintButton className="no-print">
          <Printer size={15} aria-hidden /> Печать
        </PrintButton>
      </div>

      <Card className="mt-5">
        <CardBody className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="text-xs text-fg-muted">Накопительный GPA</p>
            <p className="text-2xl font-bold tabular-nums">
              {fmtGpa(transcript.cumulativeGpa, locale)}
            </p>
          </div>
          <div>
            <p className="text-xs text-fg-muted">Всего кредитов</p>
            <p className="text-2xl font-bold tabular-nums">{transcript.totalCredits}</p>
          </div>
        </CardBody>
      </Card>

      {transcript.periods.length === 0 ? (
        <EmptyState title="Данных пока нет" />
      ) : (
        <div className="mt-6 space-y-5">
          {transcript.periods.map((p) => (
            <Card key={p.periodId}>
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>
                  {p.yearName} · {p.periodName}
                </CardTitle>
                <span className="text-sm text-fg-muted">
                  GPA {fmtGpa(p.gpa, locale)} · {p.credits} кр.
                </span>
              </CardHeader>
              <CardBody>
                <div className="scroll-x">
                  <table className="table-dense">
                    <thead>
                      <tr>
                        <th>Код</th>
                        <th>Дисциплина</th>
                        <th className="text-right">Кр.</th>
                        <th className="text-right">Балл</th>
                        <th className="text-center">{t('letter')}</th>
                        <th className="text-right">{t('gpaPoints')}</th>
                        <th>{t('traditional')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.rows.map((r, i) => (
                        <tr key={`${r.code}-${i}`}>
                          <td className="text-fg-muted">{r.code}</td>
                          <td className="whitespace-normal">{r[nameField as 'nameRu']}</td>
                          <td className="text-right tabular-nums">{r.credits}</td>
                          <td className="text-right tabular-nums">{fmtScore(r.finalScore, locale)}</td>
                          <td className="text-center">
                            {r.letter && <Badge tone={gradeTone(r.letter)}>{r.letter}</Badge>}
                          </td>
                          <td className="text-right tabular-nums">{fmtScore(r.gpaPoints, locale)}</td>
                          <td className="whitespace-normal text-fg-muted">{r.traditional ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
