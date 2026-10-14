/**
 * Для бесплатного стенда: при сборке на Vercel заполняет пустую базу
 * демо-данными, если DEMO_MODE=true. Если в базе уже есть люди — ничего не делает.
 */
import { execFileSync } from 'node:child_process';

if (process.env.DEMO_MODE === 'true') {
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit' });
} else {
  console.log('DEMO_MODE != true — демо-данные не загружаются');
}
