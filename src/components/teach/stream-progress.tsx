import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { offeringJournal } from '@/lib/grades';
import { offeringProgress } from '@/lib/teacher';

/** Прогресс потока: уроки, видео, последняя активность, допуски — для преподавателя и кафедры */
export async function StreamProgress({ offeringId }: { offeringId: string }) {
  const [t, format, journal] = await Promise.all([getTranslations(), getFormatter(), offeringJournal(offeringId)]);
  const progress = await offeringProgress(
    offeringId,
    journal.rows.map((r) => r.student.id),
  );
  const yes = t('common.yes');
  const no = t('common.no');
  return (
    <DataTable
      fileName="progress"
      columns={[
        { key: 'name', header: t('common.fullName') },
        { key: 'group', header: t('common.group'), filter: true },
        { key: 'lessons', header: t('teach.progress.lessons'), align: 'right' },
        { key: 'videos', header: t('teach.progress.videos'), align: 'right' },
        { key: 'last', header: t('teach.progress.lastActive') },
        { key: 'rk1', header: t('teach.progress.rk1'), align: 'center', filter: true },
        { key: 'rk2', header: t('teach.progress.rk2'), align: 'center', filter: true },
        { key: 'rating', header: t('teach.journal.rating'), align: 'right' },
      ]}
      rows={journal.rows.map((r) => {
        const p = progress.get(r.student.id);
        return {
          id: r.student.id,
          tone: p && p.lessonsPct < 30 ? 'warning' : undefined,
          cells: {
            name: r.name,
            group: r.groupCode,
            lessons: { v: p?.lessonsPct ?? 0, node: `${p?.lessonsPct ?? 0}%` },
            videos: { v: p?.videosPct ?? 0, node: `${p?.videosPct ?? 0}%` },
            last: { v: p?.lastSeen?.toISOString() ?? null, node: p?.lastSeen ? format.relativeTime(p.lastSeen) : '—' },
            rk1: { v: p?.rk1 ? yes : no, node: p?.rk1 === null ? '—' : <Badge tone={p?.rk1 ? 'success' : 'warning'}>{p?.rk1 ? yes : no}</Badge> },
            rk2: { v: p?.rk2 ? yes : no, node: p?.rk2 === null ? '—' : <Badge tone={p?.rk2 ? 'success' : 'warning'}>{p?.rk2 ? yes : no}</Badge> },
            rating: r.rating.rating,
          },
        };
      })}
    />
  );
}
