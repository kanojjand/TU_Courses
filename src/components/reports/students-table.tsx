import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import type { StudentStat } from '@/lib/analytics';
import { fullName } from '@/lib/utils';

/** Таблица студентов для деканата и эдвайзера; ссылка ведёт в карточку студента */
export async function StudentsTable({ list, cardBase, fileName }: { list: StudentStat[]; cardBase?: string; fileName: string }) {
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  return (
    <DataTable
      fileName={fileName}
      columns={[
        { key: 'name', header: t('common.fullName') },
        { key: 'group', header: t('common.group'), filter: true },
        { key: 'courses', header: t('reports.dean.courses'), align: 'right' },
        { key: 'progress', header: t('reports.dean.avgProgress'), align: 'right' },
        { key: 'grade', header: t('reports.dept.avgGrade'), align: 'right' },
        { key: 'last', header: t('reports.dean.lastSeen') },
        { key: 'risk', header: t('reports.dean.lagging'), filter: true },
      ]}
      rows={list.map((s) => ({
        id: s.user.id,
        href: cardBase ? `${cardBase}/${s.user.id}` : undefined,
        tone: s.lagging ? 'warning' : undefined,
        cells: {
          name: fullName(s.user),
          group: s.groupCode,
          courses: s.courses,
          progress: { v: s.avgProgress, node: s.avgProgress === null ? '—' : `${s.avgProgress}%` },
          grade: s.avgGrade,
          last: { v: s.lastSeen?.toISOString() ?? null, node: s.lastSeen ? format.relativeTime(s.lastSeen) : '—' },
          risk: { v: s.lagging ? t('common.yes') : t('common.no'), node: s.lagging ? <Badge tone="warning">{t('reports.dean.lagging')}</Badge> : '' },
        },
      }))}
    />
  );
}
