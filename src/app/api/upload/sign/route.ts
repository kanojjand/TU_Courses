import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { BUCKET_MATERIALS, createUploadUrl, materialKey } from '@/server/storage';
import { ALLOWED_MATERIAL_MIME, MAX_UPLOAD_BYTES } from '@/domain/constants';

/**
 * F-T-04. Подписанная ссылка на загрузку учебного материала.
 * Файл идёт напрямую в Supabase Storage, минуя сервер приложения.
 */

export const runtime = 'nodejs';

const schema = z.object({
  contentItemId: z.string(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const item = await prisma.contentItem.findUniqueOrThrow({
      where: { id: body.contentItemId },
      select: { id: true, module: { select: { courseId: true } } },
    });

    await requireCourseTeacher(item.module.courseId);

    if (!(ALLOWED_MATERIAL_MIME as readonly string[]).includes(body.mimeType)) {
      return NextResponse.json({ error: 'Недопустимый тип файла.' }, { status: 400 });
    }
    if (body.sizeBytes > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Размер файла превышает 100 МБ.' }, { status: 400 });
    }

    const key = materialKey(item.module.courseId, item.id, body.fileName);
    const { signedUrl, token } = await createUploadUrl(BUCKET_MATERIALS, key);

    return NextResponse.json({ signedUrl, token, storageKey: key, bucket: BUCKET_MATERIALS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
