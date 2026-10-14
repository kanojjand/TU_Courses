import { AppShell } from '@/components/shell/app-shell';
import { requireRole } from '@/lib/rbac';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin');
  return (
    <AppShell user={user} role="admin">
      {children}
    </AppShell>
  );
}
