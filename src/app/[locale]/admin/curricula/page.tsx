import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { can } from '@/lib/rbac';
import { pickLocalized } from '@/i18n/request';
import { listCurricula } from '@/server/curriculum';
import { CurriculaList } from '@/components/curriculum/curricula-list';

export const dynamic = 'force-dynamic';

/**
 * F-CUR-01. Реестр учебных планов.
 *
 * План определяется тройкой «программа + год набора + версия»: у одной
 * программы одновременно живут утверждённый план прошлого набора и черновик
 * следующего, поэтому список плоский, а не по одному плану на программу.
 */
export default async function CurriculaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageAccess(locale, 'curriculum:view');
  const t = await getTranslations('admin');

  const [curricula, programs, profiles] = await Promise.all([
    listCurricula(),
    prisma.educationProgram.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        nameKk: true,
        nameRu: true,
        nameEn: true,
        gosoProfileId: true,
      },
      orderBy: { code: 'asc' },
    }),
    prisma.gosoProfile.findMany({
      select: { id: true, code: true, nameRu: true, totalCredits: true, bdPdCreditsMin: true },
      orderBy: { totalCredits: 'asc' },
    }),
  ]);

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">{t('curricula')}</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Учебный план привязан к образовательной программе, году набора и версии. Перед
        утверждением план проходит валидатор ГОСО: план с блокирующими ошибками утвердить
        нельзя.
      </p>

      <CurriculaList
        canEdit={can(user, 'curriculum:edit')}
        curricula={curricula.map((c) => ({
          id: c.id,
          programCode: c.program.code,
          programName: pickLocalized(c.program, 'name', locale),
          admissionYear: c.admissionYear,
          version: c.version,
          studyForm: c.studyForm,
          status: c.status,
          profileCode: c.gosoProfile.code,
          requiredCredits: c.gosoProfile.totalCredits,
          totalCredits: c.totalCredits ? Number(c.totalCredits) : 0,
          totalHours: c.totalHours ?? 0,
          slotCount: c._count.slots,
          lastValidation: c.validations[0]
            ? {
                isValid: c.validations[0].isValid,
                runAt: c.validations[0].runAt.toISOString(),
              }
            : null,
        }))}
        programs={programs.map((p) => ({
          id: p.id,
          code: p.code,
          name: pickLocalized(p, 'name', locale),
          gosoProfileId: p.gosoProfileId,
        }))}
        profiles={profiles}
      />
    </>
  );
}
