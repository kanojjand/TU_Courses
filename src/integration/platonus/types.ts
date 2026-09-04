/**
 * Контракт адаптера интеграции с АИС Platonus — раздел 9 ТЗ.
 *
 * ПРИНЦИП ИЗОЛЯЦИИ (раздел 9.1, п. 1): приложение работает со своими внутренними
 * моделями и ничего не знает о формате Platonus. Всё преобразование выполняется
 * здесь. Изменение внешнего API не затрагивает основной код.
 *
 * ВНИМАНИЕ. Публичная документация Platonus отсутствует, доступ предоставляется
 * вендором — ТОО «Платонус» (раздел 9.4). Приведённые ниже структуры отражают
 * потребности Платформы, а не фактический формат вендора. После получения
 * документации правится ТОЛЬКО файл `client.ts` (преобразование форматов);
 * типы и остальной код Платформы остаются без изменений.
 */

export interface PlatonusProgram {
  externalId: string;
  code: string;
  nameKk: string;
  nameRu: string;
  nameEn?: string;
  level: 'BACHELOR' | 'MASTER' | 'PHD';
  language: 'KK' | 'RU' | 'EN';
  durationYears: number;
  totalCredits: number;
  departmentExternalId: string;
}

export interface PlatonusDiscipline {
  externalId: string;
  code: string;
  nameKk: string;
  nameRu: string;
  nameEn?: string;
  credits: number;
  cycle: 'OOD' | 'BD' | 'PD';
  component: 'OK' | 'VK' | 'KV';
  level: 'BACHELOR' | 'MASTER' | 'PHD';
  language: 'KK' | 'RU' | 'EN';
  departmentExternalId: string;
  programExternalId?: string;
}

export interface PlatonusDepartment {
  externalId: string;
  code: string;
  nameKk: string;
  nameRu: string;
  nameEn?: string;
  facultyCode: string;
  facultyNameRu: string;
}

export interface PlatonusTeacher {
  externalId: string;
  iin: string;
  lastNameKk: string;
  firstNameKk: string;
  middleNameKk?: string;
  lastNameRu: string;
  firstNameRu: string;
  middleNameRu?: string;
  lastNameEn?: string;
  firstNameEn?: string;
  email: string;
  phone?: string;
  departmentExternalId: string;
  position: string;
  academicDegree?: string;
}

export interface PlatonusStudent {
  externalId: string;
  iin: string;
  lastNameKk: string;
  firstNameKk: string;
  middleNameKk?: string;
  lastNameRu: string;
  firstNameRu: string;
  middleNameRu?: string;
  lastNameEn?: string;
  firstNameEn?: string;
  email: string;
  phone?: string;
  programExternalId: string;
  groupName: string;
  studyYear: number;
  studyForm: 'FULL_TIME' | 'PART_TIME' | 'DISTANCE' | 'EVENING';
  language: 'KK' | 'RU' | 'EN';
  status: 'ACTIVE' | 'ACADEMIC_LEAVE' | 'EXPELLED' | 'GRADUATED';
  admissionYear: number;
}

export interface PlatonusRegistration {
  studentExternalId: string;
  disciplineExternalId: string;
  periodExternalId: string;
  teacherExternalId?: string;
  streamName?: string;
}

export interface PlatonusPeriod {
  externalId: string;
  academicYear: string;
  name: string;
  ordinal: number;
  type: 'SEMESTER' | 'TRIMESTER' | 'SUMMER';
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  examStart: string;
  examEnd: string;
}

/** Из Платформы в Platonus (раздел 9.2) */
export interface OutgoingCurrentControl {
  studentExternalId: string;
  disciplineExternalId: string;
  periodExternalId: string;
  items: { title: string; score: number; maxScore: number; date: string }[];
}

export interface OutgoingMidterm {
  studentExternalId: string;
  disciplineExternalId: string;
  periodExternalId: string;
  control: 'RK1' | 'RK2';
  score: number;
}

export interface OutgoingFinalGrade {
  studentExternalId: string;
  disciplineExternalId: string;
  periodExternalId: string;
  admissionScore: number;
  examScore: number;
  finalScore: number;
  letter: string;
  gpaPoints: number;
  traditional: string;
}

export interface OutgoingAttendance {
  studentExternalId: string;
  disciplineExternalId: string;
  periodExternalId: string;
  weekStart: string;
  weekEnd: string;
  activeMinutes: number;
  itemsCompleted: number;
  attended: boolean;
}

/**
 * Интерфейс клиента. Реализации: HttpPlatonusClient (API вендора)
 * и FilePlatonusClient (резервный файловый обмен, раздел 9.3).
 */
export interface PlatonusClient {
  readonly mode: 'http' | 'file' | 'disabled';

  fetchDepartments(): Promise<PlatonusDepartment[]>;
  fetchPrograms(): Promise<PlatonusProgram[]>;
  fetchDisciplines(): Promise<PlatonusDiscipline[]>;
  fetchTeachers(): Promise<PlatonusTeacher[]>;
  fetchStudents(since?: Date): Promise<PlatonusStudent[]>;
  fetchRegistrations(periodExternalId: string): Promise<PlatonusRegistration[]>;
  fetchPeriods(): Promise<PlatonusPeriod[]>;

  pushCurrentControl(payload: OutgoingCurrentControl[]): Promise<void>;
  pushMidterms(payload: OutgoingMidterm[]): Promise<void>;
  pushFinalGrades(payload: OutgoingFinalGrade[]): Promise<void>;
  pushAttendance(payload: OutgoingAttendance[]): Promise<void>;
}
