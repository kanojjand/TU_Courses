import { setRequestLocale } from 'next-intl/server';

import { requireCourseTeacher } from '@/server/guards';
import { loadGradebook } from '@/server/grades';
import { getGradeConfig } from '@/server/settings';
import { can } from '@/lib/rbac';
import { Gradebook } from '@/components/teacher/gradebook';

export const dynamic = 'force-dynamic';

/** F-T-12. Журнал группы: студенты × оценочные мероприятия. */
export default async function GradebookPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const { user, isAssistant } = await requireCourseTeacher(id);

  const book = await loadGradebook(id);
  // Наследование параметров расчёта: вуз → дисциплина → курс
  const config = await getGradeConfig({
    disciplineId: book.course.disciplineId,
    courseId: id,
  });

  return (
    <Gradebook
      locale={locale}
      courseId={id}
      items={book.items}
      rows={book.rows}
      sheets={book.sheets}
      config={config}
      canClose={can(user, 'gradesheet:close')}
      canReopen={can(user, 'gradesheet:reopen')}
      readOnly={isAssistant}
    />
  );
}
