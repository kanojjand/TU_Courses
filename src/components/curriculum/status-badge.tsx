import { Badge } from '@/components/ui/badge';

/** Статусы маршрута согласования учебного плана (F-CUR-01) */
const STATUS: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }> = {
  DRAFT: { label: 'черновик', tone: 'neutral' },
  SUBMITTED: { label: 'на согласовании', tone: 'brand' },
  APPROVED: { label: 'утверждён', tone: 'success' },
  REJECTED: { label: 'возвращён', tone: 'warning' },
  ARCHIVED: { label: 'архив', tone: 'neutral' },
};

export function CurriculumStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const CURRICULUM_STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label])
);
