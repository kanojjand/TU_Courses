import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { settings } from '@/db/schema';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? ({ ...(fallback as object), ...(row.value as object) } as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
}
