import type { Role } from '@/db/schema';

/** Порядок ролей: первая из имеющихся открывается после входа */
export const ROLE_ORDER: Role[] = [
  'student',
  'teacher',
  'author',
  'advisor',
  'dept_head',
  'dean',
  'registrar',
  'academic_office',
  'rector',
  'admin',
];

export const ROLE_HOME: Record<Role, string> = {
  student: '/learn',
  teacher: '/teach',
  author: '/studio',
  dept_head: '/department',
  dean: '/faculty',
  academic_office: '/academic',
  registrar: '/registrar',
  advisor: '/advisor',
  rector: '/overview',
  admin: '/admin',
};

export type NavIcon =
  | 'home'
  | 'book'
  | 'calendar'
  | 'grades'
  | 'bell'
  | 'check'
  | 'sheet'
  | 'plus'
  | 'chart'
  | 'users'
  | 'upload'
  | 'history'
  | 'inbox'
  | 'settings'
  | 'plug'
  | 'log'
  | 'template'
  | 'scheme'
  | 'award'
  | 'alert';

export type NavItem = { key: string; href: string; icon: NavIcon; mobile?: boolean };

/**
 * Меню по ролям. Одна навигация во всех кабинетах, разное наполнение.
 * mobile: пункт попадает в нижнюю панель на телефоне (не больше 4).
 */
export const ROLE_NAV: Record<Role, NavItem[]> = {
  student: [
    { key: 'myCourses', href: '/learn', icon: 'book', mobile: true },
    { key: 'deadlines', href: '/learn/deadlines', icon: 'calendar', mobile: true },
    { key: 'myGrades', href: '/learn/grades', icon: 'grades', mobile: true },
  ],
  teacher: [
    { key: 'myStreams', href: '/teach', icon: 'home', mobile: true },
    { key: 'toReview', href: '/teach/review', icon: 'check', mobile: true },
    { key: 'sheets', href: '/teach/sheets', icon: 'sheet', mobile: true },
  ],
  author: [
    { key: 'myCoursesWork', href: '/studio', icon: 'book', mobile: true },
    { key: 'newCourse', href: '/studio/new', icon: 'plus', mobile: true },
    { key: 'videoStatus', href: '/studio/videos', icon: 'upload', mobile: true },
  ],
  dept_head: [
    { key: 'readiness', href: '/department', icon: 'home', mobile: true },
    { key: 'performance', href: '/department/performance', icon: 'chart', mobile: true },
    { key: 'authors', href: '/department/authors', icon: 'users', mobile: true },
  ],
  dean: [
    { key: 'facultySummary', href: '/faculty', icon: 'home', mobile: true },
    { key: 'lagging', href: '/faculty/lagging', icon: 'alert', mobile: true },
    { key: 'openSheets', href: '/faculty/sheets', icon: 'sheet', mobile: true },
  ],
  academic_office: [
    { key: 'overview', href: '/academic', icon: 'home', mobile: true },
    { key: 'calendar', href: '/academic/calendar', icon: 'calendar', mobile: true },
    { key: 'schemes', href: '/academic/schemes', icon: 'scheme', mobile: true },
    { key: 'templates', href: '/academic/templates', icon: 'template' },
    { key: 'license', href: '/academic/license', icon: 'award' },
  ],
  registrar: [
    { key: 'exchange', href: '/registrar', icon: 'home', mobile: true },
    { key: 'import', href: '/registrar/import', icon: 'upload', mobile: true },
    { key: 'sheets', href: '/registrar/sheets', icon: 'sheet', mobile: true },
    { key: 'requests', href: '/registrar/requests', icon: 'inbox', mobile: true },
    { key: 'accounts', href: '/registrar/accounts', icon: 'users' },
    { key: 'syncHistory', href: '/registrar/history', icon: 'history' },
  ],
  advisor: [{ key: 'myGroups', href: '/advisor', icon: 'users', mobile: true }],
  rector: [{ key: 'dashboard', href: '/overview', icon: 'chart', mobile: true }],
  admin: [
    { key: 'users', href: '/admin', icon: 'users', mobile: true },
    { key: 'structure', href: '/admin/structure', icon: 'home', mobile: true },
    { key: 'integrations', href: '/admin/integrations', icon: 'plug', mobile: true },
    { key: 'audit', href: '/admin/audit', icon: 'log', mobile: true },
  ],
};

/** Раздел адреса → роль. По нему proxy запоминает последнюю роль. */
export const SECTION_ROLE: [string, Role][] = [
  ['/learn', 'student'],
  ['/teach', 'teacher'],
  ['/studio', 'author'],
  ['/department', 'dept_head'],
  ['/faculty', 'dean'],
  ['/academic', 'academic_office'],
  ['/registrar', 'registrar'],
  ['/advisor', 'advisor'],
  ['/overview', 'rector'],
  ['/admin', 'admin'],
];

export function roleForPath(pathname: string): Role | null {
  for (const [prefix, role] of SECTION_ROLE) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return role;
  }
  return null;
}

/** Роли, которые назначаются вручную (студенты и преподаватели приходят из Platonus) */
export const MANUAL_ROLES: Role[] = ['author', 'dept_head', 'dean', 'academic_office', 'registrar', 'advisor', 'rector', 'admin', 'teacher', 'student'];

/** Какая область по умолчанию у роли */
export const ROLE_SCOPE: Record<Role, 'university' | 'faculty' | 'department' | 'group'> = {
  student: 'university',
  teacher: 'department',
  author: 'department',
  dept_head: 'department',
  dean: 'faculty',
  academic_office: 'university',
  registrar: 'university',
  advisor: 'group',
  rector: 'university',
  admin: 'university',
};
