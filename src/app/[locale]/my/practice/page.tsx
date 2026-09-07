import { setRequestLocale } from 'next-intl/server';

import { prisma, dec, decOrNull } from '@/lib/prisma';
import { requireUser } from '@/server/guards';
import { PracticeDiary } from '@/components/student/practice-diary';
import type { PracticeKindCode, PlacementStatusCode } from '@/domain/attestation';
import { EmptyState } from '@/components/ui/alert';

export const dynamic = 'force-dynamic';

/** F-PRC-04. Дневник практики обучающегося. */
export default async function MyPracticePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();

  if (!user.studentProfileId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Раздел доступен обучающимся"
          description="Дневник практики ведёт студент. У вашей учётной записи нет профиля обучающегося."
        />
      </div>
    );
  }

  const placements = await prisma.practicePlacement.findMany({
    where: { studentId: user.studentProfileId },
    include: {
      base: { select: { nameRu: true, address: true, contactPerson: true } },
      supervisor: { select: { lastNameRu: true, firstNameRu: true } },
      report: true,
      diary: {
        include: { reviewedBy: { select: { lastNameRu: true, firstNameRu: true } } },
        orderBy: { entryDate: 'asc' },
      },
    },
    orderBy: { startsOn: 'desc' },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <h1 className="mb-1 text-2xl font-bold">Практика</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Дневник практики заполняете вы, руководитель от вуза его проверяет.
        Правка записи снимает отметку проверки. Оценка отчёта закрывает практику,
        а её кредиты входят в общий прогресс освоения программы.
      </p>

      <PracticeDiary
        placements={placements.map((p) => ({
          id: p.id,
          kind: p.kind as PracticeKindCode,
          status: p.status as PlacementStatusCode,
          baseName: p.base?.nameRu ?? null,
          baseAddress: p.base?.address ?? null,
          contactPerson: p.base?.contactPerson ?? null,
          startsOn: p.startsOn.toISOString().slice(0, 10),
          endsOn: p.endsOn.toISOString().slice(0, 10),
          credits: dec(p.credits),
          supervisorName: p.supervisor
            ? `${p.supervisor.lastNameRu} ${p.supervisor.firstNameRu}`
            : null,
          supervisorBaseName: p.supervisorBaseName,
          reportScore: decOrNull(p.report?.score),
          reportLetter: p.report?.letter ?? null,
          reviewUniv: p.report?.reviewUniv ?? null,
          reviewBase: p.report?.reviewBase ?? null,
          entries: p.diary.map((e) => ({
            id: e.id,
            entryDate: e.entryDate.toISOString().slice(0, 10),
            content: e.content,
            hours: decOrNull(e.hours),
            reviewedByName: e.reviewedBy
              ? `${e.reviewedBy.lastNameRu} ${e.reviewedBy.firstNameRu}`
              : null,
            reviewedAt: e.reviewedAt?.toISOString().slice(0, 10) ?? null,
            comment: e.comment,
          })),
        }))}
      />
    </div>
  );
}
