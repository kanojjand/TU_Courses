import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { putFile } from '@/lib/storage';

export const runtime = 'nodejs';

/** Загрузка файла: материалы курса, сдачи заданий, файлы импорта */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 });
  const prefix = String(form?.get('prefix') ?? 'files').replace(/[^a-z-]/g, '') || 'files';
  try {
    const saved = await putFile({ data: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type, ownerId: user.id, prefix });
    return NextResponse.json(saved);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg === 'FILE_TOO_LARGE' ? 'too_large' : 'failed' }, { status: msg === 'FILE_TOO_LARGE' ? 413 : 500 });
  }
}
