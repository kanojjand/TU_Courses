/**
 * Учёт фактической активности обучающегося — раздел 4.2, п. 2 ТЗ.
 *
 * Механика:
 *  — сигнал активности с клиента раз в 30 секунд при взаимодействии со страницей;
 *  — сессия закрывается при отсутствии активности более 5 минут;
 *    неактивное время не засчитывается;
 *  — на элемент засчитывается не более 150 % его плановой трудоёмкости;
 *  — для видео учёт ведётся по фактически просмотренной доле (YouTube IFrame API);
 *  — элемент считается завершённым при выполнении условия завершения.
 *
 * Служит подтверждением участия в учебном процессе и основой отчёта
 * о посещаемости, передаваемого в ИС МО (п. 40 Типовых правил).
 */

import { round2, academicHoursToMinutes } from './hours';

export interface ActivityParams {
  /** Интервал сигнала активности, секунд */
  heartbeatIntervalSec: number;
  /** Порог неактивности для закрытия сессии, минут */
  idleTimeoutMin: number;
  /** Предельная доля плановой трудоёмкости, которую можно засчитать */
  maxCountedRatio: number;
  /** Продолжительность академического часа, минут */
  academicHourMinutes: number;
}

export const DEFAULT_ACTIVITY_PARAMS: ActivityParams = {
  heartbeatIntervalSec: 30,
  idleTimeoutMin: 5,
  maxCountedRatio: 1.5,
  academicHourMinutes: 50,
};

/**
 * Минуты, засчитываемые за один сигнал активности.
 * Сигнал подтверждает интервал, прошедший с предыдущего сигнала, но не более
 * порога неактивности — разрыв больше порога означает, что студент отсутствовал.
 */
export function creditForHeartbeat(
  msSinceLastHeartbeat: number,
  params: ActivityParams = DEFAULT_ACTIVITY_PARAMS
): number {
  const minutes = msSinceLastHeartbeat / 60000;
  const idleLimit = params.idleTimeoutMin;
  if (minutes <= 0) return 0;
  if (minutes > idleLimit) return 0; // перерыв дольше порога — не засчитывается
  const expected = params.heartbeatIntervalSec / 60;
  // Небольшой запас на дрожание таймера клиента, но не более порога неактивности
  return round2(Math.min(minutes, expected * 2));
}

/**
 * Ограничение засчитанного времени 150 % плановой трудоёмкости элемента —
 * защита от накрутки.
 */
export function capCountedMinutes(
  countedMinutes: number,
  plannedAcademicHours: number,
  params: ActivityParams = DEFAULT_ACTIVITY_PARAMS
): number {
  const plannedMinutes = academicHoursToMinutes(plannedAcademicHours, params.academicHourMinutes);
  const cap = plannedMinutes * params.maxCountedRatio;
  return round2(Math.min(Math.max(0, countedMinutes), cap));
}

/** Сессия считается устаревшей и подлежит закрытию */
export function isSessionStale(
  lastHeartbeat: Date,
  now: Date = new Date(),
  params: ActivityParams = DEFAULT_ACTIVITY_PARAMS
): boolean {
  return now.getTime() - lastHeartbeat.getTime() > params.idleTimeoutMin * 60000;
}

export type CompletionMethod = 'TIME' | 'VIDEO' | 'QUIZ' | 'ASSIGNMENT' | 'MANUAL';

export interface CompletionCheckInput {
  itemType: 'TEXT' | 'FILE' | 'VIDEO' | 'QUIZ' | 'ASSIGNMENT' | 'LINK';
  plannedAcademicHours: number;
  /** Порог завершения элемента, % */
  completionThreshold: number;
  /** Засчитанные минуты работы с элементом */
  countedMinutes: number;
  /** Просмотренная доля видео, % */
  videoWatchedPercent?: number | null;
  /** Лучший результат теста, % */
  quizBestPercent?: number | null;
  /** Проходной балл теста, % */
  quizPassingScore?: number | null;
  /** Работа по заданию сдана */
  assignmentSubmitted?: boolean;
  params?: ActivityParams;
}

export interface CompletionResult {
  completed: boolean;
  method: CompletionMethod | null;
  /** Освоенные академические часы (не более плановых) */
  earnedHours: number;
  /** Прогресс по элементу, % */
  progressPercent: number;
  reason: string;
}

/**
 * Проверка условия завершения элемента содержания.
 *
 * Освоенные часы никогда не превышают плановую трудоёмкость элемента: сверхнормативное
 * время учитывается в отчёте о фактической активности, но не в освоенных кредитах.
 */
export function checkItemCompletion(input: CompletionCheckInput): CompletionResult {
  const params = input.params ?? DEFAULT_ACTIVITY_PARAMS;
  const plannedMinutes = academicHoursToMinutes(
    input.plannedAcademicHours,
    params.academicHourMinutes
  );

  const earned = (done: boolean) =>
    done
      ? round2(input.plannedAcademicHours)
      : round2(
          Math.min(
            input.plannedAcademicHours,
            plannedMinutes > 0
              ? (input.countedMinutes / plannedMinutes) * input.plannedAcademicHours
              : 0
          )
        );

  switch (input.itemType) {
    case 'VIDEO': {
      // Учёт по фактически просмотренной доле, а не по времени на странице
      const watched = input.videoWatchedPercent ?? 0;
      const done = watched >= input.completionThreshold;
      return {
        completed: done,
        method: done ? 'VIDEO' : null,
        earnedHours: done ? round2(input.plannedAcademicHours) : round2((watched / 100) * input.plannedAcademicHours),
        progressPercent: round2(Math.min(100, watched)),
        reason: done
          ? `Просмотрено ${round2(watched)} % при пороге ${input.completionThreshold} %.`
          : `Просмотрено ${round2(watched)} % из требуемых ${input.completionThreshold} %.`,
      };
    }

    case 'QUIZ': {
      const best = input.quizBestPercent ?? 0;
      const passing = input.quizPassingScore ?? 50;
      const done = input.quizBestPercent !== null && input.quizBestPercent !== undefined && best >= passing;
      return {
        completed: done,
        method: done ? 'QUIZ' : null,
        earnedHours: earned(done),
        progressPercent: round2(Math.min(100, (best / Math.max(passing, 1)) * 100)),
        reason: done
          ? `Тест пройден: ${round2(best)} % при проходном ${passing} %.`
          : `Лучший результат ${round2(best)} %, требуется ${passing} %.`,
      };
    }

    case 'ASSIGNMENT': {
      const done = Boolean(input.assignmentSubmitted);
      return {
        completed: done,
        method: done ? 'ASSIGNMENT' : null,
        earnedHours: earned(done),
        progressPercent: done ? 100 : 0,
        reason: done ? 'Работа сдана.' : 'Работа не сдана.',
      };
    }

    // TEXT, FILE, LINK — по времени работы с элементом
    default: {
      const requiredMinutes = plannedMinutes * (input.completionThreshold / 100);
      const done = requiredMinutes <= 0 ? input.countedMinutes > 0 : input.countedMinutes >= requiredMinutes;
      const pct = requiredMinutes > 0 ? (input.countedMinutes / requiredMinutes) * 100 : done ? 100 : 0;
      return {
        completed: done,
        method: done ? 'TIME' : null,
        earnedHours: earned(done),
        progressPercent: round2(Math.min(100, pct)),
        reason: done
          ? `Проработано ${round2(input.countedMinutes)} мин при требуемых ${round2(requiredMinutes)} мин.`
          : `Проработано ${round2(input.countedMinutes)} из ${round2(requiredMinutes)} мин.`,
      };
    }
  }
}

export interface ProgressSummary {
  completedItems: number;
  totalItems: number;
  earnedHours: number;
  totalHours: number;
  percent: number;
  /** Кредиты, которые студент получит при успешном завершении курса */
  credits: number;
}

/** Агрегированный прогресс по курсу (F-S-04, раздел 8.2 — понятные единицы) */
export function summarizeProgress(
  items: { plannedAcademicHours: number; completed: boolean; earnedHours: number }[],
  credits: number
): ProgressSummary {
  const totalHours = round2(items.reduce((s, i) => s + i.plannedAcademicHours, 0));
  const earnedHours = round2(items.reduce((s, i) => s + i.earnedHours, 0));
  const completedItems = items.filter((i) => i.completed).length;
  return {
    completedItems,
    totalItems: items.length,
    earnedHours,
    totalHours,
    percent: totalHours > 0 ? round2((earnedHours / totalHours) * 100) : 0,
    credits,
  };
}

/**
 * Учёт участия для отчёта о посещаемости (п. 40 Типовых правил).
 * В дистанционном формате «посещаемость» = участие в учебном процессе за неделю.
 */
export interface WeeklyAttendance {
  weekStart: Date;
  weekEnd: Date;
  activeMinutes: number;
  itemsCompleted: number;
  /** Признак участия: активность выше порога */
  attended: boolean;
}

export function computeWeeklyAttendance(
  sessions: { startedAt: Date; countedMinutes: number }[],
  completions: { completedAt: Date }[],
  weekStart: Date,
  weekEnd: Date,
  minMinutesForAttendance = 15
): WeeklyAttendance {
  const inWeek = (d: Date) => d >= weekStart && d <= weekEnd;
  const activeMinutes = round2(
    sessions.filter((s) => inWeek(s.startedAt)).reduce((sum, s) => sum + s.countedMinutes, 0)
  );
  const itemsCompleted = completions.filter((c) => inWeek(c.completedAt)).length;
  return {
    weekStart,
    weekEnd,
    activeMinutes,
    itemsCompleted,
    attended: activeMinutes >= minMinutesForAttendance || itemsCompleted > 0,
  };
}
