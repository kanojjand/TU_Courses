import type { Role } from '@/db/schema';

/** Демо-учётки из scripts/seed.ts — показываются на странице входа, только если DEMO_MODE=true */
export const DEMO_PASSWORD = 'demo12345';

export const DEMO_ACCOUNTS: { login: string; role: Role }[] = [
  { login: 'student', role: 'student' },
  { login: 'teacher', role: 'teacher' },
  { login: 'author', role: 'author' },
  { login: 'kafedra', role: 'dept_head' },
  { login: 'dekan', role: 'dean' },
  { login: 'uchchast', role: 'academic_office' },
  { login: 'registrar', role: 'registrar' },
  { login: 'advisor', role: 'advisor' },
  { login: 'rector', role: 'rector' },
  { login: 'admin', role: 'admin' },
];

export function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}
