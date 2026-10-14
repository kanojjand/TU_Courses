import { AppShell } from '@/components/shell/app-shell';
import { requireUser } from '@/lib/auth';
import { currentRole } from '@/lib/rbac';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} role={await currentRole(user)}>
      {children}
    </AppShell>
  );
}
