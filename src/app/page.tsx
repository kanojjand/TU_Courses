import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { homePath } from '@/lib/rbac';

export default async function Root() {
  const user = await requireUser();
  redirect(await homePath(user));
}
