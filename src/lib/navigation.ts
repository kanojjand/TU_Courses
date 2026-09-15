import { adminSectionsFor, hasRole, type SessionUser } from '@/lib/rbac';

/**
 * Модель навигации по ролям — единый источник для верхнего меню на компьютере
 * и нижней панели на телефоне.
 *
 * Раньше пункты собирались прямо в шапке и выводились одной строкой: у
 * обучающегося их набиралось десять, на ноутбуке они ломались в две строки,
 * а на телефоне семь из десяти уезжали за край экрана. Теперь у роли есть
 * не больше четырёх главных пунктов — всё остальное уходит в «Ещё».
 */

export type NavIcon =
  | 'home'
  | 'courses'
  | 'grades'
  | 'chats'
  | 'iep'
  | 'practice'
  | 'transcript'
  | 'electives'
  | 'catalog'
  | 'advisees'
  | 'manage'
  | 'about'
  | 'support';

export interface NavItem {
  href: string;
  /** Ключ в пространстве `nav` */
  label: string;
  icon: NavIcon;
  /**
   * Префикс, по которому пункт считается активным. Нужен там, где адрес пункта
   * не совпадает с разделом: «Управление» ведёт на /admin/users, но подсвечиваться
   * должно на любой странице /admin.
   */
  match?: string;
}

/** Главных пунктов не больше четырёх: пятая кнопка нижней панели — «Ещё» */
export const PRIMARY_LIMIT = 4;

export function navigationFor(user: Pick<SessionUser, 'roles'> | null): {
  primary: NavItem[];
  secondary: NavItem[];
} {
  const info: NavItem[] = [
    { href: '/about', label: 'about', icon: 'about' },
    { href: '/support', label: 'supportShort', icon: 'support' },
  ];

  if (!user) {
    return {
      primary: [
        { href: '/', label: 'home', icon: 'home' },
        { href: '/courses', label: 'tabCatalog', icon: 'catalog' },
        { href: '/electives', label: 'electivesShort', icon: 'electives' },
        { href: '/about', label: 'about', icon: 'about' },
      ],
      secondary: [{ href: '/support', label: 'supportShort', icon: 'support' }],
    };
  }

  // Порядок кандидатов — это и есть приоритет: первые четыре станут главными.
  // У совмещённых ролей (преподаватель и эдвайзер) пункты сливаются без дублей.
  const candidates: NavItem[] = [];

  if (hasRole(user, 'STUDENT')) {
    candidates.push(
      { href: '/dashboard', label: 'home', icon: 'home' },
      { href: '/my/courses', label: 'tabCourses', icon: 'courses' },
      { href: '/my/grades', label: 'tabGrades', icon: 'grades' }
    );
  }
  if (hasRole(user, 'TEACHER', 'TUTOR')) {
    candidates.push({ href: '/teach', label: 'tabCourses', icon: 'courses' });
  }
  if (hasRole(user, 'ADVISOR')) {
    candidates.push({ href: '/advisor', label: 'advisees', icon: 'advisees' });
  }
  // Преподаватель формально видит ведомости и отчёты, но администратором не
  // является — раздел управления показываем только ролям, для которых он рабочий
  if (hasRole(user, 'ADMIN', 'REGISTRAR', 'METHODIST')) {
    const [section] = adminSectionsFor(user);
    if (section) {
      candidates.push({
        href: `/admin/${section}`,
        label: 'tabManage',
        icon: 'manage',
        match: '/admin',
      });
    }
  }

  candidates.push({ href: '/my/chats', label: 'chats', icon: 'chats' });

  if (hasRole(user, 'STUDENT')) {
    candidates.push(
      { href: '/my/iep', label: 'iep', icon: 'iep' },
      { href: '/my/practice', label: 'practice', icon: 'practice' },
      { href: '/my/transcript', label: 'transcript', icon: 'transcript' }
    );
  }

  candidates.push(
    { href: '/courses', label: 'tabCatalog', icon: 'catalog' },
    { href: '/electives', label: 'electivesShort', icon: 'electives' },
    ...info
  );

  const seen = new Set<string>();
  const unique = candidates.filter((item) => {
    const key = item.match ?? item.href;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    primary: unique.slice(0, PRIMARY_LIMIT),
    secondary: unique.slice(PRIMARY_LIMIT),
  };
}

/** Активен ли пункт для текущего адреса (адрес без префикса локали) */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const base = item.match ?? item.href;
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}
