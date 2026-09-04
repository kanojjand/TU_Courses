'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { workTypeLabel, type HoursValidationResult, type WorkTypeCode } from '@/domain/hours';

/**
 * F-T-07. Индикатор распределения часов.
 *
 * Раздел 8.2 ТЗ: индикатор постоянно на экране; кнопка публикации неактивна,
 * пока сумма часов не сойдётся, с явным объяснением причины.
 */
export function HoursIndicator({
  validation,
  compact,
}: {
  validation: HoursValidationResult;
  compact?: boolean;
}) {
  const t = useTranslations('teacher');
  const { plannedHours, requiredHours, delta, credits, valid, breakdown, issues } = validation;
  const percent = requiredHours > 0 ? (plannedHours / requiredHours) * 100 : 0;

  return (
    <div className="space-y-3">
      <Progress
        value={Math.min(100, percent)}
        tone={valid ? 'success' : delta > 0 ? 'danger' : 'warning'}
        label={t('hoursIndicator', {
          planned: Math.round(plannedHours * 10) / 10,
          required: requiredHours,
          credits,
        })}
      />

      <p className="flex items-start gap-2 text-sm">
        {valid ? (
          <>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span className="text-success">Объём курса соответствует объёму дисциплины в кредитах.</span>
          </>
        ) : (
          <>
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span className="text-fg">
              {delta > 0
                ? `Превышение на ${Math.abs(delta)} академических часов.`
                : `Не хватает ${Math.abs(delta)} академических часов.`}
            </span>
          </>
        )}
      </p>

      {!compact && issues.length > 0 && (
        <ul className="space-y-1 text-xs text-fg-muted">
          {issues.map((issue, i) => (
            <li key={i}>• {issue.message}</li>
          ))}
        </ul>
      )}

      {!compact && breakdown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {breakdown.map((b) => (
            <Badge key={b.workType}>
              {workTypeLabel(b.workType as WorkTypeCode)}: {b.hours} ч ({b.percent} %)
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
