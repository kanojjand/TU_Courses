import { getLocale, getTranslations } from 'next-intl/server';
import { pickName } from '@/i18n/config';
import { offeringJournal } from '@/lib/grades';
import { offeringAssessableBlocks } from '@/lib/teacher';
import { Gradebook, type GBRow } from './gradebook';

/** Журнал потока: на сервере собираем данные, редактирование — в клиентском компоненте */
export async function JournalView({ offeringId, canEdit, disciplineName, stream }: { offeringId: string; canEdit: boolean; disciplineName: { nameKk: string; nameRu: string; nameEn: string }; stream: string }) {
  const [journal, blocks, locale] = await Promise.all([offeringJournal(offeringId), offeringAssessableBlocks(offeringId), getLocale()]);
  await getTranslations();
  const now = Date.now();
  const items = journal.items.map((i) => ({
    id: i.id,
    component: i.component,
    title: i.title,
    blockId: i.blockId,
    opensAt: i.opensAt?.toISOString() ?? null,
    dueAt: i.dueAt?.toISOString() ?? null,
    hardCloseAt: i.hardCloseAt?.toISOString() ?? null,
    closed: !!i.hardCloseAt && i.hardCloseAt.getTime() < now,
  }));
  const rows: GBRow[] = journal.rows.map((r) => ({
    studentId: r.student.id,
    name: r.name,
    group: r.groupCode,
    cells: Object.fromEntries([...r.grades.entries()].map(([k, g]) => [k, { score: g.score, late: g.isLate, status: g.status }])),
    comps: r.comps,
    rating: r.rating.rating,
    admitted: r.rating.admitted,
  }));
  const fileName = `${pickName(disciplineName, locale)} ${stream}`.replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 60);
  return <Gradebook offeringId={offeringId} items={items} rows={rows} canEdit={canEdit} blocks={blocks} fileName={fileName} />;
}
