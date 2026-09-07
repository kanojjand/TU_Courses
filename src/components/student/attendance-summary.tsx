import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/alert';
import { ATTENDANCE_LABELS, type AttendanceStateCode } from '@/domain/attendance';

export interface AttendanceCourseRow {
  courseId: string;
  disciplineCode: string;
  disciplineName: string;
  periodName: string;
  total: number;
  unmarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  online: number;
  percent: number;
  /** Последние занятия — чтобы студент видел, за какое именно занятие пропуск */
  recent: { heldOn: string; state: AttendanceStateCode | null; reason: string | null }[];
}

/**
 * F-LRN-06. Посещаемость в кабинете обучающегося.
 *
 * Студент должен видеть не только процент, но и за какие занятия
 * проставлен пропуск: спор о посещаемости решается конкретной датой,
 * а не итоговой цифрой.
 */
export function AttendanceSummary({
  rows,
  threshold,
}: {
  rows: AttendanceCourseRow[];
  threshold: number;
}) {
  const withData = rows.filter((r) => r.total - r.unmarked > 0);
  const average =
    withData.length === 0
      ? null
      : Math.round((withData.reduce((a, r) => a + r.percent, 0) / withData.length) * 10) / 10;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Посещаемость</CardTitle>
        {average !== null && (
          <Badge tone={average < threshold ? 'danger' : 'success'}>
            в среднем {average} %
          </Badge>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {withData.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Отметок посещаемости пока нет"
              description="Журнал заполняет преподаватель по мере проведения занятий."
            />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Дисциплина</th>
                  <th>Период</th>
                  <th className="text-right">Занятий</th>
                  <th className="text-right">Присут.</th>
                  <th className="text-right">Пропуски</th>
                  <th className="text-right">По ув. причине</th>
                  <th className="text-right">Посещаемость</th>
                  <th>Последние занятия</th>
                </tr>
              </thead>
              <tbody>
                {withData.map((r) => (
                  <tr key={r.courseId}>
                    <td className="whitespace-normal">
                      <span className="font-medium">{r.disciplineName}</span>
                      <span className="block text-xs text-fg-muted">{r.disciplineCode}</span>
                    </td>
                    <td className="text-xs">{r.periodName}</td>
                    <td className="text-right tabular-nums">{r.total - r.unmarked}</td>
                    <td className="text-right tabular-nums">
                      {r.present + r.late + r.online}
                    </td>
                    <td className="text-right tabular-nums">
                      <span className={r.absent > 0 ? 'text-danger' : ''}>{r.absent}</span>
                    </td>
                    <td className="text-right tabular-nums">{r.excused}</td>
                    <td className="text-right tabular-nums">
                      <Badge tone={r.percent < threshold ? 'danger' : 'success'}>
                        {r.percent} %
                      </Badge>
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {r.recent.map((s, i) => (
                          <span
                            key={i}
                            title={`${s.heldOn}: ${
                              s.state ? ATTENDANCE_LABELS[s.state] : 'отметка не проставлена'
                            }${s.reason ? ` — ${s.reason}` : ''}`}
                            className={`grid h-5 w-5 place-items-center rounded text-[0.625rem] font-semibold ${
                              s.state === 'ABSENT'
                                ? 'bg-danger/15 text-danger'
                                : s.state === 'EXCUSED'
                                  ? 'bg-brand/12 text-brand'
                                  : s.state == null
                                    ? 'bg-muted/50 text-fg-muted'
                                    : 'bg-success/15 text-success'
                            }`}
                          >
                            {s.heldOn.slice(8, 10)}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
      {withData.some((r) => r.percent < threshold) && (
        <div className="border-t border-border px-5 py-3 text-sm text-warning">
          По части дисциплин посещаемость ниже {threshold} %. Сведения о посещаемости
          передаются в информационную систему уполномоченного органа.
        </div>
      )}
    </Card>
  );
}
