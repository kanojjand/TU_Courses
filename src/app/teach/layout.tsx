import { AppShell } from '@/components/shell/app-shell';
import { requireRole } from '@/lib/rbac';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('teacher');
  return (
    <AppShell user={user} role="teacher">
      {children}
    </AppShell>
  );
}
