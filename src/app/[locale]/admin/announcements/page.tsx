import { setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { hasRole } from '@/lib/rbac';
import { pickLocalized } from '@/i18n/request';
import { sortAnnouncements } from '@/domain/chat';
import { AnnouncementsPanel } from '@/components/admin/announcements-panel';

export const dynamic = 'force-dynamic';

/**
 * F-COM-05, F-COM-07, F-COM-08. Объявления с адресацией.
 *
 * Рассылка на весь университет и факультет ограничена деканатом
 * и администратором; закреплённое нормативное объявление об аккредитации
 * публикует администратор.
 */
export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageAccess(locale, 'report:view', 'settings:manage');

  // Запросы последовательные: пул на одно соединение (см. src/lib/prisma.ts)
  const announcements = await prisma.announcement.findMany({
    where: { courseId: null },
    include: {
      targets: true,
      author: { select: { lastNameRu: true, firstNameRu: true } },
      _count: { select: { acks: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const faculties = await prisma.faculty.findMany({
    select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
    orderBy: { code: 'asc' },
  });
  const departments = await prisma.department.findMany({
    select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
    orderBy: { code: 'asc' },
  });
  const programs = await prisma.educationProgram.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameKk: true, nameRu: true, nameEn: true },
    orderBy: { code: 'asc' },
  });
  const groups = await prisma.studyGroup.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 300,
  });

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Объявления</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Объявление адресуется университету, факультету, кафедре, программе, группе или
        дисциплине. Важное объявление требует подтверждения прочтения. Закреплённое
        нормативное объявление показывается первым и не смещается вниз.
      </p>

      <AnnouncementsPanel
        canMass={hasRole(user, 'ADMIN', 'REGISTRAR')}
        canNormative={hasRole(user, 'ADMIN')}
        canDelete={hasRole(user, 'ADMIN')}
        announcements={sortAnnouncements(announcements).map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          isImportant: a.isImportant,
          isPinned: a.isPinned,
          isNormative: a.isNormative,
          publishedAt: a.publishedAt?.toISOString() ?? null,
          expiresAt: a.expiresAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          authorName: `${a.author.lastNameRu} ${a.author.firstNameRu}`,
          ackCount: a._count.acks,
          targets: a.targets.map((t) => ({ scope: t.scope, scopeId: t.scopeId })),
        }))}
        options={{
          FACULTY: faculties.map((f) => ({
            id: f.id,
            label: `${f.code} · ${pickLocalized(f, 'name', locale)}`,
          })),
          DEPARTMENT: departments.map((d) => ({
            id: d.id,
            label: `${d.code} · ${pickLocalized(d, 'name', locale)}`,
          })),
          PROGRAM: programs.map((p) => ({
            id: p.id,
            label: `${p.code} · ${pickLocalized(p, 'name', locale)}`,
          })),
          GROUP: groups.map((g) => ({ id: g.id, label: g.name })),
        }}
      />
    </>
  );
}
