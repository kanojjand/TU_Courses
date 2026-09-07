/**
 * Практика и итоговая аттестация — разделы 4.8 и 4.9 ТЗ,
 * требования F-PRC-03, F-PRC-05, F-FIN-03…F-FIN-07.
 *
 * Модуль чистый: допуск к итоговой аттестации проверяется одинаково
 * в отчёте офиса Регистратора, при назначении защиты и в тестах.
 */

export type PracticeKindCode =
  | 'EDUCATIONAL'
  | 'PEDAGOGICAL'
  | 'RESEARCH'
  | 'PRODUCTION'
  | 'PRE_DIPLOMA';

export const PRACTICE_KIND_LABELS: Record<PracticeKindCode, string> = {
  EDUCATIONAL: 'учебная',
  PEDAGOGICAL: 'педагогическая',
  RESEARCH: 'исследовательская',
  PRODUCTION: 'производственная',
  PRE_DIPLOMA: 'преддипломная',
};

export type PlacementStatusCode =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'REPORT_SUBMITTED'
  | 'GRADED'
  | 'CANCELLED';

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatusCode, string> = {
  PLANNED: 'распределён',
  IN_PROGRESS: 'проходит практику',
  REPORT_SUBMITTED: 'отчёт сдан',
  GRADED: 'оценена',
  CANCELLED: 'отменена',
};

export interface PlacementCheckInput {
  /** Профиль основной программы обучающегося (Major) */
  majorProfile: string | null;
  /** Есть ли у обучающегося дополнительная программа (Minor) */
  hasMinor: boolean;
  /** Профиль организации — базы практики */
  baseProfile: string | null;
  /** Свободные места на базе; null — вместимость не задана */
  freeCapacity: number | null;
}

export interface PlacementIssue {
  level: 'ERROR' | 'WARNING';
  message: string;
}

/**
 * Основы значимых слов строки — для сравнения профилей.
 *
 * Точное вхождение подстроки на русском не работает: «подготовка учителей
 * истории» и «преподавание истории» совпадают по смыслу, но «история»
 * и «истории» — разные строки. Полноценная лемматизация здесь избыточна,
 * поэтому слова обрезаются до основы в пять букв: этого достаточно, чтобы
 * склонения одного слова совпали, и мало, чтобы совпали разные слова.
 */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zа-яё]+/i)
    .filter((w) => w.length > 4)
    .map((w) => w.slice(0, 5));
}

/**
 * F-PRC-03. Проверка распределения обучающегося на базу практики.
 *
 * Правило Minor: при наличии дополнительной программы база выбирается
 * по профилю основной. Профиль организации — свободный текст справочника,
 * поэтому несовпадение даёт предупреждение, а не запрет: формулировки
 * профилей в договорах не унифицированы, и жёсткий запрет заблокировал бы
 * распределение там, где по существу всё верно.
 */
export function checkPlacement(input: PlacementCheckInput): PlacementIssue[] {
  const issues: PlacementIssue[] = [];

  if (input.freeCapacity != null && input.freeCapacity <= 0) {
    issues.push({
      level: 'ERROR',
      message: 'На базе практики нет свободных мест.',
    });
  }

  if (input.hasMinor && input.majorProfile && input.baseProfile) {
    const majorStems = stems(input.majorProfile);
    const baseStems = new Set(stems(input.baseProfile));
    const matches = majorStems.some((s) => baseStems.has(s));
    if (!matches) {
      issues.push({
        level: 'WARNING',
        message:
          'У обучающегося есть дополнительная программа (Minor), а профиль базы ' +
          'не совпадает с профилем основной программы. При наличии Minor база ' +
          'практики выбирается по профилю Major.',
      });
    }
  }

  if (input.hasMinor && (!input.majorProfile || !input.baseProfile)) {
    issues.push({
      level: 'WARNING',
      message:
        'Профиль основной программы или базы не заполнен — проверить соответствие ' +
        'автоматически невозможно.',
    });
  }

  return issues;
}

export interface AdmissionInput {
  /** Кредиты, освоенные обучающимся (включая перезачтённые) */
  creditsEarned: number;
  /** Кредиты, требуемые профилем ГОСО */
  creditsRequired: number;
  /** Кредиты итоговой аттестации — они осваиваются самой аттестацией */
  finalCertCredits: number;
  /** Дисциплины с неудовлетворительной оценкой */
  failedDisciplines: { name: string; letter: string | null }[];
  /** Практики, не завершённые оценкой */
  unfinishedPractices: { kind: PracticeKindCode; status: PlacementStatusCode }[];
  /** Форма итоговой аттестации по программе */
  form: 'THESIS_DEFENSE' | 'COMPLEX_EXAM';
  /** Состояние дипломной работы, если форма — защита */
  thesisStatus: string | null;
}

export interface AdmissionCondition {
  label: string;
  met: boolean;
  detail: string;
}

export interface AdmissionResult {
  admitted: boolean;
  conditions: AdmissionCondition[];
  creditsShortfall: number;
}

/**
 * F-FIN-04. Допуск к итоговой аттестации.
 *
 * Проверяется полнота освоенных кредитов и отсутствие задолженностей.
 * Кредиты самой итоговой аттестации из требуемого объёма вычитаются:
 * они осваиваются защитой или комплексным экзаменом, и требовать их
 * до допуска — значит не допустить никого.
 */
export function checkAdmission(input: AdmissionInput): AdmissionResult {
  const required = Math.max(0, input.creditsRequired - input.finalCertCredits);
  const shortfall = Math.max(0, Math.round((required - input.creditsEarned) * 100) / 100);

  const conditions: AdmissionCondition[] = [
    {
      label: 'Освоен полный объём программы',
      met: shortfall === 0,
      detail:
        shortfall === 0
          ? `Освоено ${input.creditsEarned} кредитов при требуемых ${required} (без учёта ИА)`
          : `Не хватает ${shortfall} кредитов: освоено ${input.creditsEarned} из ${required}`,
    },
    {
      label: 'Нет академических задолженностей',
      met: input.failedDisciplines.length === 0,
      detail:
        input.failedDisciplines.length === 0
          ? 'Неудовлетворительных оценок нет'
          : `Задолженности по ${input.failedDisciplines.length}: ` +
            input.failedDisciplines
              .slice(0, 5)
              .map((d) => `${d.name} (${d.letter ?? '—'})`)
              .join(', ') +
            (input.failedDisciplines.length > 5 ? ' и другим' : ''),
    },
    {
      label: 'Все виды практики завершены',
      met: input.unfinishedPractices.length === 0,
      detail:
        input.unfinishedPractices.length === 0
          ? 'Практики завершены и оценены'
          : `Не завершены: ` +
            input.unfinishedPractices
              .map(
                (p) =>
                  `${PRACTICE_KIND_LABELS[p.kind]} (${PLACEMENT_STATUS_LABELS[p.status]})`
              )
              .join(', '),
    },
  ];

  // Для защиты дипломной работы нужна сама работа, допущенная к защите
  if (input.form === 'THESIS_DEFENSE') {
    const ok = input.thesisStatus === 'ADMITTED' || input.thesisStatus === 'SUBMITTED';
    conditions.push({
      label: 'Дипломная работа сдана и допущена к защите',
      met: ok,
      detail:
        input.thesisStatus == null
          ? 'Тема дипломной работы не закреплена'
          : ok
            ? 'Работа сдана'
            : `Состояние работы: ${input.thesisStatus}`,
    });
  }

  return {
    admitted: conditions.every((c) => c.met),
    conditions,
    creditsShortfall: shortfall,
  };
}

/**
 * F-FIN-06. Можно ли назначить итоговую аттестацию повторно.
 *
 * Повторная сдача комплексного экзамена и повторная защита с целью
 * повышения оценки не допускаются (Типовые правила, п. 45). Пересдача
 * при «неудовлетворительно» в тот же период не разрешается — обучающийся
 * отчисляется с формулировкой «не выполнивший требования образовательной
 * программы» (п. 47).
 */
export function canScheduleAttestation(existing: {
  heldAt: Date | null;
  isPassed: boolean | null;
} | null): { allowed: boolean; reason: string | null } {
  if (!existing || existing.heldAt == null) {
    return { allowed: true, reason: null };
  }
  if (existing.isPassed) {
    return {
      allowed: false,
      reason:
        'Итоговая аттестация уже сдана. Повторная сдача с целью повышения оценки ' +
        'не допускается (Типовые правила, п. 45).',
    };
  }
  return {
    allowed: false,
    reason:
      'Итоговая аттестация не сдана. Пересдача в тот же период не разрешается: ' +
      'обучающийся отчисляется как не выполнивший требования образовательной ' +
      'программы (Типовые правила, п. 47).',
  };
}

/**
 * F-PRC-05. Кредиты практики входят в общий прогресс наравне с дисциплинами.
 * Засчитываются только оценённые практики: незавершённая практика кредитов
 * не даёт.
 */
export function practiceCredits(
  placements: { credits: number; status: PlacementStatusCode }[]
): number {
  const total = placements
    .filter((p) => p.status === 'GRADED')
    .reduce((a, p) => a + p.credits, 0);
  return Math.round(total * 100) / 100;
}

/**
 * F-FIN-07. Присуждение степени и выдача диплома.
 *
 * Степень присуждается решением комиссии при сданной итоговой аттестации;
 * без него диплом не формируется.
 */
export function canIssueDiploma(attestation: {
  isPassed: boolean | null;
  degreeAwarded: boolean;
  protocolNo: string | null;
} | null): { allowed: boolean; reason: string | null } {
  if (!attestation) {
    return { allowed: false, reason: 'Итоговая аттестация не проводилась.' };
  }
  if (!attestation.isPassed) {
    return { allowed: false, reason: 'Итоговая аттестация не сдана.' };
  }
  if (!attestation.protocolNo) {
    return { allowed: false, reason: 'Не указан номер протокола заседания комиссии.' };
  }
  if (!attestation.degreeAwarded) {
    return {
      allowed: false,
      reason: 'Комиссия не приняла решение о присуждении степени.',
    };
  }
  return { allowed: true, reason: null };
}
