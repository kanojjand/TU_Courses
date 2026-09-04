import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setUiLanguage } from '@/server/actions/profile';

export const runtime = 'nodejs';

const schema = z.object({ locale: z.enum(['kk', 'ru', 'en']) });

export async function POST(request: Request) {
  try {
    const { locale } = schema.parse(await request.json());
    await setUiLanguage(locale);
    return NextResponse.json({ ok: true });
  } catch {
    // Неавторизованный пользователь — язык хранится только в cookie
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
