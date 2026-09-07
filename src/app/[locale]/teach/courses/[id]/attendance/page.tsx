import { setRequestLocale } from 'next-intl/server';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { loadAttendance } from '@/server/attendance';
import { AttendanceJournal } from '@/components/teacher/attendance-journal';

export const dynamic = 'force-dynamic';

/**
 * F-LRN-06. Журнал посещаемости: занятия × обучающиеся.
 *
 * Сведения о посещаемости вуз обязан передавать в информационную систему
 * уполномоченного органа (п. 40 Типовых правил), поэтому журнал — не
 * вспомогательный инструмент преподавателя, а источник отчётных данных.
 */
export default async function AttendancePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { readOnly } = await requireCourseTeacher(id);

  const [data, modules] = await Promise.all([
    loadAttendance(id),
    prisma.module.findMany({
      where: { courseId: id },
      select: { id: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ]);

  return (
    <AttendanceJournal
      courseId={id}
      readOnly={readOnly}
      threshold={data.threshold}
      totals={data.totals}
      modules={modules}
      students={data.students.map((s) => ({
        id: s.id,
        name: `${s.user.lastNameRu} ${s.user.firstNameRu}${
          s.user.middleNameRu ? ' ' + s.user.middleNameRu[0] + '.' : ''
        }`,
        groupName: s.group?.name ?? null,
      }))}
      sessions={data.sessions.map((s) => ({
        id: s.id,
        heldOn: s.heldOn.toISOString().slice(0, 10),
        startsAt: s.startsAt,
        lessonKind: s.lessonKind,
        moduleId: s.moduleId,
        moduleTitle: s.module?.title ?? null,
        topic: s.topic,
        marks: s.marks.map((m) => ({
          studentId: m.studentId,
          state: m.state,
          reason: m.reason,
        })),
      }))}
      summary={data.summary}
      riskIds={data.risks.map((r) => r.studentId)}
    />
  );
}
