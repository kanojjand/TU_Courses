import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { canViewCourseContent, getCurrentUser } from '@/server/guards';
import { createDownloadUrl } from '@/server/storage';

/**
 * Раздел 6.3 ТЗ: доступ к файлам только по подписанным ссылкам с ограниченным
 * сроком действия. Прямые публичные ссылки на объектное хранилище недопустимы.
 *
 * F-S-05: при включённом ограничении скачивания ссылка выдаётся в режиме
 * просмотра (inline), без принудительного сохранения на устройство.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const { attachmentId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: {
      contentItem: {
        select: { module: { select: { courseId: true } } },
      },
      submission: {
        select: {
          studentId: true,
          assignment: {
            select: { contentItem: { select: { module: { select: { courseId: true } } } } },
          },
        },
      },
    },
  });

  if (!attachment) return NextResponse.json({ error: 'Файл не найден.' }, { status: 404 });

  const courseId =
    attachment.contentItem?.module.courseId ??
    attachment.submission?.assignment.contentItem.module.courseId;

  if (!courseId || !(await canViewCourseContent(courseId))) {
    return NextResponse.json({ error: 'Доступ запрещён.' }, { status: 403 });
  }

  // Работу студента видит он сам и преподаватели курса
  if (attachment.submission) {
    const isOwner = attachment.submission.studentId === user.studentProfileId;
    const isStaff = Boolean(user.teacherProfileId) || user.roles.includes('ADMIN') || user.roles.includes('REGISTRAR');
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: 'Доступ запрещён.' }, { status: 403 });
    }
  }

  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { preventDownload: true },
  });

  // Ключ копии курса указывает на исходный объект (см. copyCourseContent)
  const realKey = attachment.storageKey.split('#')[0];

  const url = await createDownloadUrl(
    attachment.bucket,
    realKey,
    900,
    !course.preventDownload,
    attachment.fileName
  );

  await prisma.activityLog.create({
    data: { userId: user.id, courseId, type: 'DOWNLOAD_FILE', meta: { attachmentId } },
  });

  return NextResponse.redirect(url);
}
