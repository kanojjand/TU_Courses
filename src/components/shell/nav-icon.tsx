import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  ChartColumn,
  CheckCheck,
  FileSpreadsheet,
  GraduationCap,
  History,
  House,
  Inbox,
  LayoutTemplate,
  Plug,
  Plus,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Upload,
  Users,
} from 'lucide-react';
import type { NavIcon as N } from '@/lib/roles';

const map = {
  home: House,
  book: BookOpen,
  calendar: CalendarClock,
  grades: GraduationCap,
  bell: Bell,
  check: CheckCheck,
  sheet: FileSpreadsheet,
  plus: Plus,
  chart: ChartColumn,
  users: Users,
  upload: Upload,
  history: History,
  inbox: Inbox,
  settings: Settings,
  plug: Plug,
  log: ScrollText,
  template: LayoutTemplate,
  scheme: SlidersHorizontal,
  award: Award,
  alert: AlertTriangle,
} satisfies Record<N, unknown>;

export function NavIcon({ name, className }: { name: N; className?: string }) {
  const Icon = map[name];
  return <Icon className={className} aria-hidden />;
}
