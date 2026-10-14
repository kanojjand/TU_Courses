/**
 * Схема базы TU Online (раздел 4 ТЗ).
 *
 * Все таблицы лежат в схеме `lms`: так их не видит REST API Supabase
 * на бесплатном стенде, а на своём сервере схема просто отделяет LMS
 * от служебных таблиц (pg-boss и т. п.).
 *
 * Перечисления хранятся текстом с проверкой на уровне TypeScript —
 * добавить новое значение можно без миграции типа.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const lms = pgSchema('lms');

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────────────────── Значения перечислений ───────────────────────── */

export const LOCALES = ['kk', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const ROLES = [
  'student',
  'teacher',
  'author',
  'dept_head',
  'dean',
  'academic_office',
  'registrar',
  'advisor',
  'rector',
  'admin',
] as const;
export type Role = (typeof ROLES)[number];

export const SCOPE_TYPES = ['university', 'faculty', 'department', 'program', 'group', 'offering'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const STUDY_FORMS = ['full_time', 'part_time', 'distance'] as const;
export const STUDENT_STATUSES = ['studying', 'academic_leave', 'expelled', 'graduated'] as const;
export const LESSON_TYPES = ['lecture', 'practice', 'lab', 'srop'] as const;
export type LessonType = (typeof LESSON_TYPES)[number];
export const COURSE_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export const BLOCK_TYPES = ['video', 'text', 'file', 'quiz', 'assignment', 'link'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const MEDIA_STATUSES = ['uploading', 'processing', 'ready', 'error'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];
export const QUESTION_TYPES = ['single', 'multiple', 'matching', 'ordering', 'short'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const GRADE_COMPONENTS = ['TK1', 'RK1', 'TK2', 'RK2', 'EXAM'] as const;
export type GradeComponent = (typeof GRADE_COMPONENTS)[number];
export const GRADE_STATUSES = ['draft', 'final', 'sent', 'confirmed'] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];
export const WINDOW_KINDS = [
  'registration',
  'rk1',
  'rk2',
  'session',
  'grading_rk1',
  'grading_rk2',
  'grading_exam',
] as const;
export type WindowKind = (typeof WINDOW_KINDS)[number];
export const BATCH_STATUSES = ['draft', 'ready', 'sent', 'confirmed', 'rejected'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const SYNC_KINDS = [
  'structure',
  'faculties',
  'departments',
  'programs',
  'groups',
  'students',
  'teachers',
  'disciplines',
  'offerings',
  'enrollments',
  'grades',
] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/* ───────────────────────── 4.1 Оргструктура и календарь ───────────────────────── */

export const academicYears = lms.table('academic_years', {
  id: id(),
  title: text('title').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
});

export const academicPeriods = lms.table(
  'academic_periods',
  {
    id: id(),
    yearId: uuid('year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    kind: text('kind', { enum: ['semester', 'extra'] }).notNull().default('semester'),
    /** Код периода для обмена файлами: «2026-2027-1» */
    code: text('code').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
  },
  (t) => [uniqueIndex('academic_periods_code_uq').on(t.code)],
);

export const calendarWindows = lms.table(
  'calendar_windows',
  {
    id: id(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => academicPeriods.id, { onDelete: 'cascade' }),
    /** null — для всех форм обучения */
    studyForm: text('study_form', { enum: STUDY_FORMS }),
    kind: text('kind', { enum: WINDOW_KINDS }).notNull(),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
  },
  (t) => [index('calendar_windows_period_idx').on(t.periodId)],
);

export const faculties = lms.table(
  'faculties',
  {
    id: id(),
    code: text('code').notNull(),
    nameKk: text('name_kk').notNull(),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en').notNull(),
  },
  (t) => [uniqueIndex('faculties_code_uq').on(t.code)],
);

export const departments = lms.table(
  'departments',
  {
    id: id(),
    facultyId: uuid('faculty_id')
      .notNull()
      .references(() => faculties.id),
    code: text('code').notNull(),
    nameKk: text('name_kk').notNull(),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en').notNull(),
  },
  (t) => [uniqueIndex('departments_code_uq').on(t.code), index('departments_faculty_idx').on(t.facultyId)],
);

export const programs = lms.table(
  'programs',
  {
    id: id(),
    code: text('code').notNull(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    degree: text('degree', { enum: ['bachelor', 'master', 'doctoral'] }).notNull().default('bachelor'),
    nameKk: text('name_kk').notNull(),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en').notNull(),
  },
  (t) => [uniqueIndex('programs_code_uq').on(t.code)],
);

export const studyGroups = lms.table(
  'study_groups',
  {
    id: id(),
    code: text('code').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id),
    courseYear: integer('course_year').notNull(),
    studyLang: text('study_lang', { enum: LOCALES }).notNull(),
    studyForm: text('study_form', { enum: STUDY_FORMS }).notNull().default('full_time'),
  },
  (t) => [uniqueIndex('study_groups_code_uq').on(t.code), index('study_groups_program_idx').on(t.programId)],
);

/* ───────────────────────── 4.2 Люди и доступ ───────────────────────── */

export const users = lms.table(
  'users',
  {
    id: id(),
    login: text('login').notNull(),
    lastName: text('last_name').notNull(),
    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    email: text('email'),
    locale: text('locale', { enum: LOCALES }).notNull().default('ru'),
    status: text('status', { enum: ['active', 'blocked'] }).notNull().default('active'),
    passwordHash: text('password_hash'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    /** Режим для слабовидящих: крупный шрифт и высокий контраст */
    accessibleMode: boolean('accessible_mode').notNull().default(false),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: ts('locked_until'),
    lastLoginAt: ts('last_login_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_login_uq').on(sql`lower(${t.login})`)],
);

export const students = lms.table(
  'students',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => studyGroups.id),
    courseYear: integer('course_year').notNull().default(1),
    studyForm: text('study_form', { enum: STUDY_FORMS }).notNull().default('full_time'),
    studyLang: text('study_lang', { enum: LOCALES }).notNull().default('ru'),
    status: text('status', { enum: STUDENT_STATUSES }).notNull().default('studying'),
  },
  (t) => [index('students_group_idx').on(t.groupId)],
);

export const staff = lms.table('staff', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  departmentId: uuid('department_id').references(() => departments.id),
  position: text('position'),
});

export const userRoles = lms.table(
  'user_roles',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }).notNull(),
    scopeType: text('scope_type', { enum: SCOPE_TYPES }).notNull().default('university'),
    /** null для области «весь вуз» */
    scopeId: uuid('scope_id'),
    grantedBy: uuid('granted_by').references(() => users.id),
    grantedAt: createdAt('granted_at'),
  },
  (t) => [
    uniqueIndex('user_roles_uq').on(t.userId, t.role, t.scopeType, sql`coalesce(${t.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    index('user_roles_user_idx').on(t.userId),
  ],
);

export const sessions = lms.table(
  'sessions',
  {
    /** sha256 от токена из cookie — сам токен в базе не хранится */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/* ───────────────────────── 4.3 Дисциплины и потоки ───────────────────────── */

export const disciplines = lms.table(
  'disciplines',
  {
    id: id(),
    code: text('code').notNull(),
    nameKk: text('name_kk').notNull(),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en').notNull(),
    credits: integer('credits').notNull().default(5),
    departmentId: uuid('department_id').references(() => departments.id),
  },
  (t) => [uniqueIndex('disciplines_code_uq').on(t.code), index('disciplines_department_idx').on(t.departmentId)],
);

export const gradeSchemes = lms.table('grade_schemes', {
  id: id(),
  title: text('title').notNull(),
  /** Веса внутри рейтинга: R1 = TK1·w + RK1·(1−w), R2 = TK2·w + RK2·(1−w) */
  currentWeight: real('current_weight').notNull().default(0.6),
  /** Порог рейтинга допуска к экзамену */
  admissionThreshold: integer('admission_threshold').notNull().default(50),
  /** Минимальный балл РК для допуска (0 — не проверять) */
  rkMinScore: integer('rk_min_score').notNull().default(0),
  lateRule: text('late_rule', { enum: ['none', 'penalty', 'zero'] }).notNull().default('penalty'),
  /** Штраф за позднюю сдачу, % от балла */
  latePenaltyPct: integer('late_penalty_pct').notNull().default(20),
  /** Порог просмотра видео для засчитывания, % */
  videoThreshold: integer('video_threshold').notNull().default(90),
  rk1Week: integer('rk1_week').notNull().default(7),
  rk2Week: integer('rk2_week').notNull().default(15),
  isDefault: boolean('is_default').notNull().default(false),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const offerings = lms.table(
  'offerings',
  {
    id: id(),
    disciplineId: uuid('discipline_id')
      .notNull()
      .references(() => disciplines.id),
    periodId: uuid('period_id')
      .notNull()
      .references(() => academicPeriods.id),
    lessonType: text('lesson_type', { enum: LESSON_TYPES }).notNull().default('lecture'),
    /** Код потока из Platonus */
    stream: text('stream').notNull(),
    language: text('language', { enum: LOCALES }).notNull().default('ru'),
    teacherId: uuid('teacher_id').references(() => users.id),
    courseId: uuid('course_id'),
    courseVersionId: uuid('course_version_id'),
    gradeSchemeId: uuid('grade_scheme_id').references(() => gradeSchemes.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('offerings_uq').on(t.disciplineId, t.periodId, t.lessonType, t.stream),
    index('offerings_teacher_idx').on(t.teacherId),
    index('offerings_course_idx').on(t.courseId),
  ],
);

export const enrollments = lms.table(
  'enrollments',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['active', 'dropped'] }).notNull().default('active'),
    source: text('source', { enum: ['platonus_file', 'platonus_api', 'manual'] }).notNull().default('platonus_file'),
    enrolledAt: createdAt('enrolled_at'),
  },
  (t) => [
    uniqueIndex('enrollments_uq').on(t.studentId, t.offeringId),
    index('enrollments_offering_idx').on(t.offeringId),
  ],
);

/* ───────────────────────── 4.4 Контент ───────────────────────── */

export const courses = lms.table(
  'courses',
  {
    id: id(),
    disciplineId: uuid('discipline_id').references(() => disciplines.id),
    language: text('language', { enum: LOCALES }).notNull().default('ru'),
    title: text('title').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => users.id),
    status: text('status', { enum: COURSE_STATUSES }).notNull().default('draft'),
    /** Шаблон курса от учебной части */
    isTemplate: boolean('is_template').notNull().default(false),
    reviewComment: text('review_comment'),
    currentVersionId: uuid('current_version_id'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('courses_discipline_idx').on(t.disciplineId)],
);

export const courseAuthors = lms.table(
  'course_authors',
  {
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => users.id),
    assignedAt: createdAt('assigned_at'),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.userId] })],
);

export const courseVersions = lms.table(
  'course_versions',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    /** Снимок структуры: модули → уроки → блоки на момент публикации */
    snapshot: jsonb('snapshot').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    publishedAt: createdAt('published_at'),
  },
  (t) => [uniqueIndex('course_versions_uq').on(t.courseId, t.number)],
);

export const modules = lms.table(
  'modules',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    week: integer('week').notNull().default(1),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
  },
  (t) => [index('modules_course_idx').on(t.courseId)],
);

export const lessons = lms.table(
  'lessons',
  {
    id: id(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    required: boolean('required').notNull().default(true),
    estMinutes: integer('est_minutes'),
  },
  (t) => [index('lessons_module_idx').on(t.moduleId)],
);

export type BlockData = {
  /** video */
  mediaId?: string;
  /** text — очищенный HTML */
  html?: string;
  /** file */
  fileId?: string;
  /** link / внешнее видео / Zoom */
  url?: string;
  description?: string;
};

export const lessonBlocks = lms.table(
  'lesson_blocks',
  {
    id: id(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    type: text('type', { enum: BLOCK_TYPES }).notNull(),
    title: text('title').notNull().default(''),
    required: boolean('required').notNull().default(false),
    data: jsonb('data').$type<BlockData>().notNull().default({}),
  },
  (t) => [index('lesson_blocks_lesson_idx').on(t.lessonId)],
);

export const mediaAssets = lms.table(
  'media_assets',
  {
    id: id(),
    provider: text('provider', { enum: ['bunny', 'external'] }).notNull().default('bunny'),
    bunnyVideoId: text('bunny_video_id'),
    /** Внешняя ссылка (YouTube, mp4) — пока Bunny не подключён */
    url: text('url'),
    filename: text('filename'),
    durationSec: integer('duration_sec'),
    status: text('status', { enum: MEDIA_STATUSES }).notNull().default('uploading'),
    error: text('error'),
    ownerId: uuid('owner_id').references(() => users.id),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('media_assets_bunny_uq').on(t.bunnyVideoId), index('media_assets_course_idx').on(t.courseId)],
);

export const files = lms.table('files', {
  id: id(),
  storageKey: text('storage_key').notNull(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull().default('application/octet-stream'),
  size: integer('size').notNull().default(0),
  ownerId: uuid('owner_id').references(() => users.id),
  createdAt: createdAt(),
});

/** Тела файлов для драйвера хранения «db» (бесплатный стенд) */
export const fileBlobs = lms.table('file_blobs', {
  fileId: uuid('file_id')
    .primaryKey()
    .references(() => files.id, { onDelete: 'cascade' }),
  data: bytea('data').notNull(),
});

/* ───────────────────────── 4.5 Тесты и задания ───────────────────────── */

export const questionBanks = lms.table(
  'question_banks',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('question_banks_course_idx').on(t.courseId)],
);

export const questions = lms.table(
  'questions',
  {
    id: id(),
    bankId: uuid('bank_id')
      .notNull()
      .references(() => questionBanks.id, { onDelete: 'cascade' }),
    type: text('type', { enum: QUESTION_TYPES }).notNull().default('single'),
    text: text('text').notNull(),
    difficulty: integer('difficulty').notNull().default(1),
    /** Для «короткого ответа» — допустимые ответы */
    data: jsonb('data').$type<{ answers?: string[] }>().notNull().default({}),
  },
  (t) => [index('questions_bank_idx').on(t.bankId)],
);

export const questionOptions = lms.table(
  'question_options',
  {
    id: id(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    position: integer('position').notNull().default(0),
    /** Для «соответствия» — правая часть пары */
    matchText: text('match_text'),
  },
  (t) => [index('question_options_question_idx').on(t.questionId)],
);

export const quizzes = lms.table(
  'quizzes',
  {
    id: id(),
    blockId: uuid('block_id')
      .notNull()
      .references(() => lessonBlocks.id, { onDelete: 'cascade' }),
    bankId: uuid('bank_id').references(() => questionBanks.id, { onDelete: 'set null' }),
    /** Сколько вопросов брать по сложности 1, 2, 3 */
    countEasy: integer('count_easy').notNull().default(5),
    countMedium: integer('count_medium').notNull().default(3),
    countHard: integer('count_hard').notNull().default(2),
    timeLimitMin: integer('time_limit_min'),
    attemptsAllowed: integer('attempts_allowed').notNull().default(1),
    shuffle: boolean('shuffle').notNull().default(true),
    showResults: boolean('show_results').notNull().default(true),
  },
  (t) => [uniqueIndex('quizzes_block_uq').on(t.blockId)],
);

export const quizAttempts = lms.table(
  'quiz_attempts',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    /** Порядок вопросов и вариантов, зафиксированный при старте */
    layout: jsonb('layout').$type<{ q: string; o: string[] }[]>().notNull(),
    startedAt: createdAt('started_at'),
    deadlineAt: ts('deadline_at'),
    finishedAt: ts('finished_at'),
    score: real('score'),
  },
  (t) => [index('quiz_attempts_student_quiz_idx').on(t.studentId, t.quizId)],
);

export const attemptAnswers = lms.table(
  'attempt_answers',
  {
    id: id(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    answer: jsonb('answer').$type<unknown>(),
    /** Доля верного 0…1 */
    credit: real('credit'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attempt_answers_uq').on(t.attemptId, t.questionId)],
);

export const assignments = lms.table(
  'assignments',
  {
    id: id(),
    blockId: uuid('block_id')
      .notNull()
      .references(() => lessonBlocks.id, { onDelete: 'cascade' }),
    maxScore: integer('max_score').notNull().default(100),
    instructions: text('instructions'),
    criteria: text('criteria'),
    allowedExt: text('allowed_ext').notNull().default('pdf,docx,doc,pptx,xlsx,zip,jpg,png'),
    maxFiles: integer('max_files').notNull().default(5),
  },
  (t) => [uniqueIndex('assignments_block_uq').on(t.blockId)],
);

export const submissions = lms.table(
  'submissions',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => assignments.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    text: text('text'),
    submittedAt: createdAt('submitted_at'),
    isLate: boolean('is_late').notNull().default(false),
    score: real('score'),
    feedback: text('feedback'),
    gradedBy: uuid('graded_by').references(() => users.id),
    gradedAt: ts('graded_at'),
  },
  (t) => [
    uniqueIndex('submissions_uq').on(t.studentId, t.assignmentId, t.offeringId),
    index('submissions_offering_idx').on(t.offeringId),
  ],
);

/* ───────────────────────── 4.6 Прогресс и цифровой след ───────────────────────── */

export const lessonProgress = lms.table(
  'lesson_progress',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    /** Без внешнего ключа: урок может быть удалён из черновика, а студенты видят опубликованную версию */
    lessonId: uuid('lesson_id').notNull(),
    status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
    startedAt: createdAt('started_at'),
    completedAt: ts('completed_at'),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.offeringId, t.lessonId] })],
);

export const videoProgress = lms.table(
  'video_progress',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Без внешнего ключа — см. lesson_progress */
    blockId: uuid('block_id').notNull(),
    mediaId: uuid('media_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    /** Просмотренные отрезки в секундах: [[0, 120], [300, 410]] */
    segments: jsonb('segments').$type<[number, number][]>().notNull().default([]),
    durationSec: integer('duration_sec'),
    percent: real('percent').notNull().default(0),
    lastPosition: real('last_position').notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.blockId] })],
);

/**
 * Цифровой след. В миграции таблица разбита по месяцам (PARTITION BY RANGE),
 * Drizzle об этом знать не нужно — для запросов это обычная таблица.
 */
export const activityEvents = lms.table(
  'activity_events',
  {
    id: bigserial('id', { mode: 'number' }).notNull(),
    userId: uuid('user_id').notNull(),
    event: text('event').notNull(),
    objectType: text('object_type'),
    objectId: text('object_id'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })],
);

/* ───────────────────────── 4.7 Оценки ───────────────────────── */

export const gradeItems = lms.table(
  'grade_items',
  {
    id: id(),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    component: text('component', { enum: GRADE_COMPONENTS }).notNull(),
    title: text('title').notNull(),
    /** Связанный тест или задание (блок урока) */
    blockId: uuid('block_id').references(() => lessonBlocks.id, { onDelete: 'set null' }),
    opensAt: ts('opens_at'),
    dueAt: ts('due_at'),
    hardCloseAt: ts('hard_close_at'),
    maxScore: integer('max_score').notNull().default(100),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('grade_items_offering_idx').on(t.offeringId)],
);

export const grades = lms.table(
  'grades',
  {
    id: id(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gradeItemId: uuid('grade_item_id')
      .notNull()
      .references(() => gradeItems.id, { onDelete: 'cascade' }),
    /** Балл 0–100 */
    score: real('score').notNull(),
    /** Балл до штрафа за опоздание */
    rawScore: real('raw_score'),
    status: text('status', { enum: GRADE_STATUSES }).notNull().default('draft'),
    isLate: boolean('is_late').notNull().default(false),
    approvedBy: uuid('approved_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('grades_uq').on(t.studentId, t.gradeItemId), index('grades_item_idx').on(t.gradeItemId)],
);

export const gradeChangeRequests = lms.table(
  'grade_change_requests',
  {
    id: id(),
    gradeItemId: uuid('grade_item_id')
      .notNull()
      .references(() => gradeItems.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'set null' }),
    oldScore: real('old_score'),
    newScore: real('new_score').notNull(),
    reason: text('reason').notNull(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: ts('decided_at'),
    decisionComment: text('decision_comment'),
    createdAt: createdAt(),
  },
  (t) => [index('grade_change_requests_status_idx').on(t.status)],
);

/* ───────────────────────── 4.8 Интеграция с Platonus ───────────────────────── */

export const externalIds = lms.table(
  'external_ids',
  {
    entityType: text('entity_type').notNull(),
    lmsId: uuid('lms_id').notNull(),
    system: text('system').notNull().default('platonus'),
    externalId: text('external_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.system, t.entityType, t.externalId] }),
    uniqueIndex('external_ids_lms_uq').on(t.system, t.entityType, t.lmsId),
  ],
);

export type SyncCounters = { total: number; created: number; updated: number; skipped: number; errors: number };

export const syncRuns = lms.table('sync_runs', {
  id: id(),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  kind: text('kind', { enum: SYNC_KINDS }).notNull(),
  method: text('method', { enum: ['file', 'api'] }).notNull().default('file'),
  startedAt: createdAt('started_at'),
  finishedAt: ts('finished_at'),
  status: text('status', { enum: ['running', 'success', 'partial', 'failed'] }).notNull().default('running'),
  counters: jsonb('counters').$type<SyncCounters>().notNull().default({ total: 0, created: 0, updated: 0, skipped: 0, errors: 0 }),
  fileName: text('file_name'),
  startedBy: uuid('started_by').references(() => users.id),
});

export const syncIssues = lms.table(
  'sync_issues',
  {
    id: id(),
    runId: uuid('run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    rowNo: integer('row_no'),
    problem: text('problem').notNull(),
    payload: jsonb('payload'),
    resolved: boolean('resolved').notNull().default(false),
  },
  (t) => [index('sync_issues_run_idx').on(t.runId)],
);

export const exportBatches = lms.table(
  'export_batches',
  {
    id: id(),
    offeringId: uuid('offering_id')
      .notNull()
      .references(() => offerings.id, { onDelete: 'cascade' }),
    component: text('component', { enum: GRADE_COMPONENTS }).notNull(),
    status: text('status', { enum: BATCH_STATUSES }).notNull().default('draft'),
    teacherConfirmedBy: uuid('teacher_confirmed_by').references(() => users.id),
    teacherConfirmedAt: ts('teacher_confirmed_at'),
    registrarBy: uuid('registrar_by').references(() => users.id),
    sentAt: ts('sent_at'),
    confirmedAt: ts('confirmed_at'),
    comment: text('comment'),
    fileId: uuid('file_id').references(() => files.id),
    createdAt: createdAt(),
  },
  (t) => [index('export_batches_offering_idx').on(t.offeringId), index('export_batches_status_idx').on(t.status)],
);

export const exportRows = lms.table(
  'export_rows',
  {
    id: id(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => exportBatches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    score: real('score').notNull(),
    isLate: boolean('is_late').notNull().default(false),
    approvedBy: text('approved_by'),
    platonusResponse: text('platonus_response'),
  },
  (t) => [index('export_rows_batch_idx').on(t.batchId)],
);

/* ───────────────────────── 4.9 Служебные ───────────────────────── */

export const notifications = lms.table(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Ключ сообщения и параметры — текст собирается на языке получателя */
    params: jsonb('params').$type<Record<string, string | number>>().notNull().default({}),
    link: text('link'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt)],
);

export const auditLog = lms.table(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt), index('audit_log_entity_idx').on(t.entityType, t.entityId)],
);

export const settings = lms.table('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
