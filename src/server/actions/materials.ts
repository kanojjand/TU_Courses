'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireCourseTeacher } from '@/server/guards';
import { deleteObject } from '@/server/storage';

/** F-T-04. Регистрация загруженного учебного материала. */
export async function attachMaterial(input: {
  contentItemId: string;
  storageKey: string;
  bucket: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<string> {
  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: input.contentItemId },
    select: { module: { select: { courseId: true } } },
  });
  const { user } = await requireCourseTeacher(item.module.courseId);

  const attachment = await prisma.attachment.create({
    data: {
      contentItemId: input.contentItemId,
      storageKey: input.storageKey,
      bucket: input.bucket,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      uploadedById: user.id,
    },
  });

  revalidatePath(`/teach/courses/${item.module.courseId}/builder`);
  return attachment.id;
}

export async function removeMaterial(attachmentId: string): Promise<void> {
  const attachment = await prisma.attachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { contentItem: { select: { module: { select: { courseId: true } } } } },
  });

  const courseId = attachment.contentItem?.module.courseId;
  if (!courseId) throw new Error('Файл не связан с элементом содержания.');
  await requireCourseTeacher(courseId);

  // Объект-копия ссылается на исходный файл — сам объект в хранилище не удаляется
  const isCopy = attachment.storageKey.includes('#copy-');
  if (!isCopy) {
    await deleteObject(attachment.bucket, attachment.storageKey).catch(() => {
      // Файл мог быть удалён ранее — запись в БД всё равно убирается
    });
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/teach/courses/${courseId}/builder`);
}
