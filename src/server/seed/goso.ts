/**
 * Справочник профилей ГОСО — раздел 2.2 ТЗ, правила R-01…R-08.
 *
 * Значения перенесены из Приказа МНВО РК № 2 от 20.07.2022 (с изменениями
 * № 419 от 27.08.2024, № 90 от 04.03.2025, № 200 от 22.04.2025,
 * № 225 от 04.05.2026). Здесь они лежат как данные первичного наполнения:
 * после сида профили редактируются в интерфейсе (F-ADM-14), поэтому при
 * изменении норматива правка кода не требуется.
 *
 * Отличие профилей 240 и 300 — только в объёме циклов БД и ПД: цикл ООД
 * (56 кредитов) и итоговая аттестация (8 кредитов) в обеих моделях одинаковы.
 */

import type { ControlFormCode } from '@/domain/goso';

export interface GosoProfileSeed {
  code: string;
  nameKk: string;
  nameRu: string;
  nameEn: string;
  level: 'BACHELOR' | 'MASTER' | 'PHD';
  totalCredits: number;
  totalHoursMin: number;
  hoursPerCredit: number;
  oodCredits: number;
  oodOkCredits: number;
  oodVkKvCredits: number;
  bdPdCreditsMin: number;
  finalCertCreditsMin: number;
  yearCreditsNorm: number;
  legalBasis: string;
  validFrom: string;
}

export interface GosoMandatorySeed {
  slug: string;
  nameKk: string;
  nameRu: string;
  nameEn: string;
  credits: number;
  hours: number;
  controlForm: ControlFormCode;
  contentEditable: 'NONE' | 'HALF' | 'FULL';
  isModule: boolean;
  sortOrder: number;
}

export const GOSO_PROFILES: GosoProfileSeed[] = [
  {
    code: 'BACHELOR_240',
    nameKk: 'Бакалавриат, 240 кредит',
    nameRu: 'Бакалавриат, 240 кредитов',
    nameEn: 'Bachelor, 240 credits',
    level: 'BACHELOR',
    totalCredits: 240,
    totalHoursMin: 7200,
    hoursPerCredit: 30,
    oodCredits: 56,
    oodOkCredits: 51,
    oodVkKvCredits: 5,
    bdPdCreditsMin: 176,
    finalCertCreditsMin: 8,
    yearCreditsNorm: 60,
    legalBasis: 'ГОСО ВО, Приложение 1',
    validFrom: '2022-07-20',
  },
  {
    code: 'BACHELOR_300',
    nameKk: 'Бакалавриат, 300 кредит (екі сабақтас пәннің педагогін даярлауды қоса)',
    nameRu: 'Бакалавриат, 300 кредитов (в т. ч. педагог по двум смежным предметам)',
    nameEn: 'Bachelor, 300 credits',
    level: 'BACHELOR',
    totalCredits: 300,
    totalHoursMin: 9000,
    hoursPerCredit: 30,
    oodCredits: 56,
    oodOkCredits: 51,
    oodVkKvCredits: 5,
    bdPdCreditsMin: 236,
    finalCertCreditsMin: 8,
    yearCreditsNorm: 60,
    legalBasis: 'ГОСО ВО, Приложение 2',
    validFrom: '2022-07-20',
  },
  {
    code: 'VSUZ_240',
    nameKk: 'ЖОО, 240 кредит',
    nameRu: 'ВСУЗ, 240 кредитов',
    nameEn: 'Military higher education institution, 240 credits',
    level: 'BACHELOR',
    totalCredits: 240,
    totalHoursMin: 7200,
    hoursPerCredit: 30,
    oodCredits: 56,
    oodOkCredits: 51,
    oodVkKvCredits: 5,
    bdPdCreditsMin: 178,
    finalCertCreditsMin: 6,
    yearCreditsNorm: 60,
    legalBasis: 'ГОСО ВО, Приложение 3',
    validFrom: '2022-07-20',
  },
  {
    code: 'SPECIALIST_300',
    nameKk: 'Мамандық, 300 кредит',
    nameRu: 'Специалитет, 300 кредитов',
    nameEn: 'Specialist, 300 credits',
    level: 'BACHELOR',
    totalCredits: 300,
    totalHoursMin: 9000,
    hoursPerCredit: 30,
    oodCredits: 56,
    oodOkCredits: 51,
    oodVkKvCredits: 5,
    bdPdCreditsMin: 236,
    finalCertCreditsMin: 8,
    yearCreditsNorm: 60,
    legalBasis: 'ГОСО ВО, п. 2 пп. 9',
    validFrom: '2022-07-20',
  },
];

/**
 * Обязательный компонент цикла ООД — 51 кредит фиксированного состава
 * (ГОСО, п. 6 и Приложение 1). Состав одинаков для всех профилей, кроме ВСУЗ.
 *
 * `contentEditable` фиксирует правило п. 4 ГОСО: по «Истории Казахстана»
 * и «Философии» содержание задаёт типовая учебная программа и вуз его
 * не меняет; казахский язык и модуль социально-политических знаний вуз
 * меняет до 50 %; остальные — полностью.
 */
export const GOSO_MANDATORY: GosoMandatorySeed[] = [
  {
    slug: 'history_kz',
    nameKk: 'Қазақстан тарихы',
    nameRu: 'История Казахстана',
    nameEn: 'History of Kazakhstan',
    credits: 5,
    hours: 150,
    // R-11: государственный экзамен в том же академическом периоде
    controlForm: 'STATE_EXAM',
    contentEditable: 'NONE',
    isModule: false,
    sortOrder: 1,
  },
  {
    slug: 'philosophy',
    nameKk: 'Философия',
    nameRu: 'Философия',
    nameEn: 'Philosophy',
    credits: 5,
    hours: 150,
    controlForm: 'EXAM',
    contentEditable: 'NONE',
    isModule: false,
    sortOrder: 2,
  },
  {
    slug: 'foreign_lang',
    nameKk: 'Шетел тілі',
    nameRu: 'Иностранный язык',
    nameEn: 'Foreign Language',
    credits: 10,
    hours: 300,
    controlForm: 'EXAM',
    contentEditable: 'FULL',
    isModule: false,
    sortOrder: 3,
  },
  {
    slug: 'state_lang',
    nameKk: 'Қазақ (орыс) тілі',
    nameRu: 'Казахский (русский) язык',
    nameEn: 'Kazakh (Russian) Language',
    credits: 10,
    hours: 300,
    controlForm: 'EXAM',
    contentEditable: 'HALF',
    isModule: false,
    sortOrder: 4,
  },
  {
    slug: 'ict',
    nameKk: 'Ақпараттық-коммуникациялық технологиялар',
    nameRu: 'Информационно-коммуникационные технологии',
    nameEn: 'Information and Communication Technologies',
    credits: 5,
    hours: 150,
    controlForm: 'EXAM',
    contentEditable: 'FULL',
    isModule: false,
    sortOrder: 5,
  },
  {
    slug: 'sociopolit',
    nameKk: 'Әлеуметтік-саяси білімдер модулі',
    nameRu: 'Модуль социально-политических знаний (социология, политология, культурология, психология)',
    nameEn: 'Module of Socio-Political Knowledge',
    credits: 8,
    hours: 240,
    controlForm: 'EXAM',
    contentEditable: 'HALF',
    // 8 кредитов не разбиты жёстко: вуз делит модуль на дисциплины
    // при неизменной сумме (раздел 2.3 ТЗ)
    isModule: true,
    sortOrder: 6,
  },
  {
    slug: 'phys_culture',
    nameKk: 'Дене шынықтыру',
    nameRu: 'Физическая культура',
    nameEn: 'Physical Training',
    credits: 8,
    hours: 240,
    controlForm: 'CREDIT_TEST',
    contentEditable: 'FULL',
    isModule: false,
    sortOrder: 7,
  },
];

/** Профили, для которых действует состав обязательного компонента выше */
export const MANDATORY_APPLIES_TO = ['BACHELOR_240', 'BACHELOR_300', 'SPECIALIST_300'];
