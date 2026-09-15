import {
  BookOpen,
  Briefcase,
  ClipboardList,
  GraduationCap,
  House,
  Info,
  LayoutGrid,
  LibraryBig,
  LifeBuoy,
  ListChecks,
  MessageCircle,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { NavIcon as NavIconName } from '@/lib/navigation';

const ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  courses: BookOpen,
  grades: GraduationCap,
  chats: MessageCircle,
  iep: ClipboardList,
  practice: Briefcase,
  transcript: ScrollText,
  electives: ListChecks,
  catalog: LibraryBig,
  advisees: Users,
  manage: LayoutGrid,
  about: Info,
  support: LifeBuoy,
};

export function NavIcon({
  name,
  size = 20,
  className,
}: {
  name: NavIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} aria-hidden />;
}
