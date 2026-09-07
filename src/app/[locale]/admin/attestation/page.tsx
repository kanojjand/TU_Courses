import { setRequestLocale } from 'next-intl/server';

import { prisma, decOrNull } from '@/lib/prisma';
import { requirePageAccess } from '@/server/guards';
import {
  loadCommittees,
  loadTheses,
  loadAttestations,
  loadDiplomas,
  admissionReport,
} from '@/server/attestation';
import { AttestationPanel } from '@/components/admin/attestation-panel';

export const dynamic = 'force-dynamic';

/**
 * F-FIN-01…F-FIN-07. Итоговая аттестация: комиссии, дипломные работы,
 * допуск, протоколы защиты и дипломы.
 */
export default async function AttestationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ student?: string }>;
}) {
  const { locale } = await params;
  const { student: studentId } = await searchParams;
  setRequestLocale(locale);
  await requirePageAccess(locale, 'period:manage');

  // Последовательно: пул на одно соединение (см. src/lib/prisma.ts)
  const committees = await loadCommittees();
  const theses = await loadTheses();
  const attestations = await loadAttestations();
  const diplomas = await loadDiplomas();
  const programs = await prisma.educationProgram.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameRu: true },
    orderBy: { code: 'asc' },
  });
  const years = await prisma.academicYear.findMany({
    select: { id: true, name: true },
    orderBy: { startDate: 'desc' },
  });
  const teachers = await prisma.teacherProfile.findMany({
    select: { userId: true, user: { select: { lastNameRu: true, firstNameRu: true } } },
    orderBy: { user: { lastNameRu: 'asc' } },
  });
  const departments = await prisma.department.findMany({
    select: { id: true, code: true, nameRu: true },
    orderBy: { code: 'asc' },
  });
  const students = await prisma.studentProfile.findMany({
    where: { status: { in: ['ACTIVE', 'REINSTATED', 'MOBILITY', 'GRADUATED'] } },
    select: {
      id: true,
      user: { select: { lastNameRu: true, firstNameRu: true } },
      group: { select: { name: true } },
      program: { select: { code: true } },
    },
    orderBy: { user: { lastNameRu: 'asc' } },
    take: 300,
  });

  // Допуск проверяется по выбранному обучающемуся: это адресная операция
  const admission = studentId ? await admissionReport(studentId, locale) : null;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Итоговая аттестация</h1>
      <p className="mb-5 max-w-prose text-sm text-fg-muted">
        Аттестационные комиссии, темы дипломных работ, допуск к аттестации, протоколы
        защиты и дипломы. Повторная сдача для повышения оценки не допускается;
        при неудовлетворительной оценке обучающийся отчисляется.
      </p>

      <AttestationPanel
        selectedStudentId={studentId ?? null}
        admission={admission}
        committees={committees.map((c) => ({
          id: c.id,
          nameRu: c.nameRu,
          programCode: c.program.code,
          yearName: c.academicYear.name,
          chairName: c.chair ? `${c.chair.lastNameRu} ${c.chair.firstNameRu}` : null,
          orderNo: c.orderNo,
          validFrom: c.validFrom?.toISOString().slice(0, 10) ?? null,
          validTo: c.validTo?.toISOString().slice(0, 10) ?? null,
          members: c.members.map((m) => ({
            name: `${m.user.lastNameRu} ${m.user.firstNameRu}`,
            role: m.role,
          })),
          attestationCount: c._count.attestations,
        }))}
        theses={theses.map((t) => ({
          id: t.id,
          studentId: t.student.id,
          studentName: `${t.student.user.lastNameRu} ${t.student.user.firstNameRu}`,
          groupName: t.student.group?.name ?? null,
          titleRu: t.titleRu,
          isProject: t.isProject,
          supervisorName: t.supervisor
            ? `${t.supervisor.lastNameRu} ${t.supervisor.firstNameRu}`
            : null,
          departmentCode: t.department?.code ?? null,
          status: t.status,
          approvedOrderNo: t.approvedOrderNo,
          originalityPct: decOrNull(t.originalityPct),
        }))}
        attestations={attestations.map((a) => ({
          id: a.id,
          studentId: a.student.id,
          studentName: `${a.student.user.lastNameRu} ${a.student.user.firstNameRu}`,
          groupName: a.student.group?.name ?? null,
          form: a.form,
          thesisTitle: a.thesis?.titleRu ?? null,
          committeeName: a.committee?.nameRu ?? null,
          scheduledAt: a.scheduledAt?.toISOString().slice(0, 16) ?? null,
          heldAt: a.heldAt?.toISOString().slice(0, 10) ?? null,
          percent: decOrNull(a.percent),
          letter: a.letter,
          isPassed: a.isPassed,
          protocolNo: a.protocolNo,
          degreeAwarded: a.degreeAwarded,
        }))}
        diplomas={diplomas.map((d) => ({
          id: d.id,
          studentId: d.student.id,
          studentName: `${d.student.user.lastNameRu} ${d.student.user.firstNameRu}`,
          programCode: d.student.program.code,
          number: d.number,
          qrCode: d.qrCode,
          issuedOn: d.issuedOn?.toISOString().slice(0, 10) ?? null,
          withHonours: d.withHonours,
          gpa: decOrNull(d.gpa),
          supplementNumber: d.supplement?.number ?? null,
        }))}
        students={students.map((s) => ({
          id: s.id,
          name: `${s.user.lastNameRu} ${s.user.firstNameRu}`,
          groupName: s.group?.name ?? null,
          programCode: s.program.code,
        }))}
        programs={programs.map((p) => ({ id: p.id, label: `${p.code} · ${p.nameRu}` }))}
        years={years}
        teachers={teachers.map((t) => ({
          id: t.userId,
          name: `${t.user.lastNameRu} ${t.user.firstNameRu}`,
        }))}
        departments={departments.map((d) => ({ id: d.id, label: `${d.code} · ${d.nameRu}` }))}
      />
    </>
  );
}
