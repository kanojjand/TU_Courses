/**
 * Ролевая модель доступа — раздел 3 ТЗ.
 *
 * Модель — RBAC с проверкой принадлежности к объекту. Наличие роли
 * «Преподаватель» не даёт доступа ко всем курсам: требуется назначение
 * на конкретную дисциплину в конкретном академическом периоде.
 */

export type RoleCode =
  | 'GUEST'
  | 'STUDENT'
  | 'TEACHER'
  | 'TUTOR'
  | 'ADVISOR'
  | 'METHODIST'
  | 'REGISTRAR'
  | 'ADMIN'
  | 'PROCTOR';

export const ROLE_LABELS: Record<RoleCode, { kk: string; ru: string; en: string }> = {
  GUEST:     { kk: 'Қонақ',                  ru: 'Гость',                        en: 'Guest' },
  STUDENT:   { kk: 'Білім алушы',            ru: 'Студент',                      en: 'Student' },
  TEACHER:   { kk: 'Оқытушы',                ru: 'Преподаватель',                en: 'Teacher' },
  TUTOR:     { kk: 'Тьютор',                 ru: 'Тьютор / ассистент',           en: 'Tutor' },
  ADVISOR:   { kk: 'Эдвайзер',               ru: 'Эдвайзер',                     en: 'Advisor' },
  METHODIST: { kk: 'Кафедра әдіскері',       ru: 'Методист кафедры',             en: 'Methodist' },
  REGISTRAR: { kk: 'Тіркеуші офисі',         ru: 'Офис регистратора / деканат',  en: 'Registrar' },
  ADMIN:     { kk: 'Әкімші',                 ru: 'Администратор',                en: 'Administrator' },
  PROCTOR:   { kk: 'Прокторинг',             ru: 'Проктор',                      en: 'Proctor' },
};

/** Атомарные права */
export type Permission =
  // Курсы и содержание
  | 'course:create'
  | 'course:edit_own'
  | 'course:edit_any'
  | 'course:submit_review'
  | 'course:review'
  | 'course:publish'
  | 'course:view_content'
  // Оценивание
  | 'grade:enter'
  | 'grade:view_own'
  | 'grade:view_course'
  | 'grade:view_any'
  | 'grade:finalize'
  | 'grade:edit_after_close'
  // Ведомости
  | 'gradesheet:view'
  | 'gradesheet:close'
  | 'gradesheet:reopen'
  // Обучение
  | 'learn:enroll'
  | 'learn:take_quiz'
  | 'learn:submit_assignment'
  // Учебные планы (раздел 4.2)
  | 'curriculum:view'
  | 'curriculum:edit'
  | 'curriculum:approve'
  // ИУП и регистрация (раздел 4.4)
  | 'iep:manage_own'
  | 'iep:view_any'
  | 'iep:approve'
  | 'iep:confirm'
  // Группы, кураторы, эдвайзеры, статусы обучающихся (раздел 4.5)
  | 'group:manage'
  | 'staff:assign'
  | 'student:status'
  // Администрирование
  | 'user:manage'
  | 'user:import'
  | 'reference:manage'
  | 'period:manage'
  | 'enrollment:manage'
  | 'report:view'
  | 'report:export'
  | 'audit:view'
  | 'settings:manage'
  | 'integration:manage'
  | 'integration:approve_final'
  | 'pd:view_full_iin'
  // Наблюдение
  | 'progress:view_advisees'
  | 'proctoring:observe';

const T: Permission[] = [
  'course:create',
  'course:edit_own',
  'course:submit_review',
  'course:publish',
  'course:view_content',
  'grade:enter',
  'grade:view_course',
  'grade:finalize',
  'gradesheet:view',
  'report:view',
  'report:export',
];

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  GUEST: [],

  STUDENT: [
    'learn:enroll',
    'learn:take_quiz',
    'learn:submit_assignment',
    'grade:view_own',
    'course:view_content',
    // Свой ИУП студент формирует сам; утверждают эдвайзер и офис Регистратора
    'iep:manage_own',
  ],

  TEACHER: T,

  // Как преподаватель, но без права публикации курса и утверждения итоговых оценок
  TUTOR: T.filter((p) => p !== 'course:publish' && p !== 'grade:finalize'),

  // Просмотр прогресса закреплённых студентов, без права редактирования оценок.
  // Учебный план видит целиком: без него не проконсультировать по выбору дисциплин.
  ADVISOR: [
    'progress:view_advisees',
    'grade:view_course',
    'report:view',
    'curriculum:view',
    // F-IEP-04: согласование ИУП закреплённых студентов
    'iep:view_any',
    'iep:approve',
  ],

  // Согласование курсов перед публикацией, учебные планы и валидатор ГОСО
  METHODIST: [
    'course:review',
    'course:view_content',
    'report:view',
    'report:export',
    'curriculum:view',
    'curriculum:edit',
  ],

  REGISTRAR: [
    'course:view_content',
    'grade:view_any',
    'grade:edit_after_close',
    'gradesheet:view',
    'gradesheet:close',
    'gradesheet:reopen',
    'period:manage',
    'enrollment:manage',
    'user:import',
    'report:view',
    'report:export',
    'integration:approve_final',
    'pd:view_full_iin',
    'curriculum:view',
    'curriculum:approve',
    'iep:view_any',
    'iep:confirm',
    'group:manage',
    'staff:assign',
    'student:status',
  ],

  ADMIN: [
    'course:edit_any',
    'course:view_content',
    'grade:view_any',
    'gradesheet:view',
    'user:manage',
    'user:import',
    'reference:manage',
    'period:manage',
    'enrollment:manage',
    'report:view',
    'report:export',
    'audit:view',
    'settings:manage',
    'integration:manage',
    'pd:view_full_iin',
    'curriculum:view',
    'iep:view_any',
    'group:manage',
    'staff:assign',
  ],

  PROCTOR: ['proctoring:observe'],
};

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: RoleCode[];
  uiLanguage: 'KK' | 'RU' | 'EN';
  studentProfileId?: string | null;
  teacherProfileId?: string | null;
  departmentId?: string | null;
  hasConsent: boolean;
  mustChangePassword: boolean;
}

/** Есть ли у пользователя указанное право */
export function can(user: Pick<SessionUser, 'roles'> | null, permission: Permission): boolean {
  if (!user) return false;
  return user.roles.some((r) => ROLE_PERMISSIONS[r]?.includes(permission));
}

/** Есть ли у пользователя хотя бы одно из прав */
export function canAny(user: Pick<SessionUser, 'roles'> | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

export function hasRole(user: Pick<SessionUser, 'roles'> | null, ...roles: RoleCode[]): boolean {
  if (!user) return false;
  return roles.some((r) => user.roles.includes(r));
}

/** Полный набор прав пользователя */
export function permissionsOf(user: Pick<SessionUser, 'roles'> | null): Set<Permission> {
  const set = new Set<Permission>();
  if (!user) return set;
  for (const role of user.roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}

/** Разделы административной части, доступные роли — для построения меню */
export function adminSectionsFor(user: Pick<SessionUser, 'roles'> | null): string[] {
  const sections: string[] = [];
  if (can(user, 'user:manage')) sections.push('users');
  if (can(user, 'reference:manage')) sections.push('programs', 'disciplines');
  if (can(user, 'curriculum:view')) sections.push('curricula');
  if (can(user, 'group:manage')) sections.push('groups');
  if (can(user, 'iep:confirm')) sections.push('ieps');
  if (can(user, 'period:manage')) sections.push('periods');
  if (can(user, 'enrollment:manage')) sections.push('enrollments');
  if (canAny(user, ['course:review', 'course:edit_any'])) sections.push('courses');
  if (can(user, 'gradesheet:view')) sections.push('gradesheets');
  if (can(user, 'grade:edit_after_close')) sections.push('appeals');
  if (canAny(user, ['report:view', 'settings:manage'])) sections.push('announcements');
  if (can(user, 'report:view')) sections.push('reports');
  if (can(user, 'integration:manage') || can(user, 'integration:approve_final'))
    sections.push('integrations');
  if (can(user, 'audit:view')) sections.push('audit');
  if (can(user, 'settings:manage')) sections.push('settings');
  return sections;
}

/** Домашний маршрут после входа — по приоритету ролей */
export function homeRouteFor(user: Pick<SessionUser, 'roles'> | null): string {
  if (!user) return '/login';

  // Для административных ролей маршрут выводится из списка доступных
  // разделов, а не задаётся вручную: иначе роль легко отправить в раздел,
  // прав на который у неё нет. Так, офис регистратора не имеет user:manage,
  // а методист — gradesheet:view, и оба упирались в отказ сразу после входа.
  if (hasRole(user, 'ADMIN', 'REGISTRAR', 'METHODIST')) {
    const [section] = adminSectionsFor(user);
    if (section) return `/admin/${section}`;
  }

  // Преподаватель ведёт курсы, а не администрирует, — хотя формально видит
  // ведомости и отчёты. Его рабочее место «Мои курсы».
  if (hasRole(user, 'TEACHER', 'TUTOR')) return '/teach';

  // У эдвайзера нет профиля обучающегося, поэтому кабинет студента для него —
  // тупик с пустым состоянием. Его рабочее место — список подопечных.
  if (hasRole(user, 'ADVISOR')) return '/advisor';
  if (hasRole(user, 'STUDENT')) return '/dashboard';

  const [fallback] = adminSectionsFor(user);
  return fallback ? `/admin/${fallback}` : '/';
}
