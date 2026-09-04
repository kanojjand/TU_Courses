import { setRequestLocale, getTranslations } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import { can, ROLE_LABELS, type RoleCode } from '@/lib/rbac';
import { maskIin, decryptIin } from '@/lib/crypto';
import { UsersTable } from '@/components/admin/users-table';
import { UserForm } from '@/components/admin/user-form';

export const dynamic = 'force-dynamic';

/** F-A-03. Пользователи: создание, импорт, роли, блокировка, сброс пароля. */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const actor = await requirePageAccess(locale, 'user:manage', 'user:import');
  const { q, role } = await searchParams;
  const t = await getTranslations('admin');

  const users = await prisma.user.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { lastNameRu: { contains: q, mode: 'insensitive' } },
              { firstNameRu: { contains: q, mode: 'insensitive' } },
              { lastNameKk: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(role ? { roles: { some: { role: { code: role as never } } } } : {}),
    },
    include: {
      roles: { include: { role: true } },
      studentProfile: { include: { group: true, program: { select: { code: true } } } },
      teacherProfile: { include: { department: { select: { code: true } } } },
    },
    orderBy: [{ lastNameRu: 'asc' }],
    take: 300,
  });

  // Справочники для формы создания: без программы обучающийся не заводится,
  // без кафедры — сотрудник.
  const canManage = can(actor, 'user:manage');
  const [programs, groups, departments] = canManage
    ? await Promise.all([
        prisma.educationProgram.findMany({
          select: { id: true, code: true, nameRu: true },
          orderBy: { code: 'asc' },
        }),
        prisma.studyGroup.findMany({
          where: { isActive: true },
          select: { id: true, name: true, programId: true },
          orderBy: { name: 'asc' },
        }),
        prisma.department.findMany({
          select: { id: true, code: true, nameRu: true },
          orderBy: { code: 'asc' },
        }),
      ])
    : [[], [], []];

  const showFullIin = can(actor, 'pd:view_full_iin');
  const lang = actor.uiLanguage.toLowerCase() as 'kk' | 'ru' | 'en';

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{t('users')}</h1>

      {canManage && (
        <UserForm
          options={{
            roles: (Object.keys(ROLE_LABELS) as RoleCode[]).map((code) => ({
              code,
              label: ROLE_LABELS[code][lang],
            })),
            programs: programs.map((p) => ({ id: p.id, label: `${p.code} · ${p.nameRu}` })),
            groups: groups.map((g) => ({ id: g.id, label: g.name, programId: g.programId })),
            departments: departments.map((d) => ({ id: d.id, label: `${d.code} · ${d.nameRu}` })),
          }}
        />
      )}

      <UsersTable
        canManage={canManage}
        roleOptions={(Object.keys(ROLE_LABELS) as RoleCode[]).map((code) => ({
          code,
          label: ROLE_LABELS[code][lang],
        }))}
        users={users.map((u) => {
          let iin = '—';
          if (u.iinEncrypted) {
            try {
              const decrypted = decryptIin(u.iinEncrypted);
              iin = showFullIin ? decrypted : maskIin(decrypted);
            } catch {
              iin = '••••••••••••';
            }
          }
          return {
            id: u.id,
            email: u.email,
            fullName: [u.lastNameRu, u.firstNameRu, u.middleNameRu].filter(Boolean).join(' '),
            iin,
            status: u.status,
            roles: u.roles.map((r) => r.role.code as string),
            group: u.studentProfile?.group?.name ?? null,
            program: u.studentProfile?.program.code ?? null,
            department: u.teacherProfile?.department.code ?? null,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          };
        })}
      />
    </>
  );
}
