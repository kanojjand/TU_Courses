import { ClipboardCheck, ExternalLink, FileText, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { inArray } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { db } from '@/db';
import { assignments, files, quizzes } from '@/db/schema';
import { flattenLessons, type CourseSnapshot } from '@/lib/course';
import { videoSource } from '@/lib/lesson';
import { cleanHtml } from '@/lib/sanitize';
import { cn, formatBytes } from '@/lib/utils';

/** Курс «глазами студента»: без учёта прогресса, для автора и кафедры */
export async function CoursePreview({ snap, basePath, lessonId }: { snap: CourseSnapshot; basePath: string; lessonId?: string }) {
  const t = await getTranslations();
  const all = flattenLessons(snap);
  const lesson = all.find((l) => l.id === lessonId) ?? all[0];
  const blocks = lesson?.blocks ?? [];
  const blockIds = blocks.map((b) => b.id);
  const fileIds = blocks.map((b) => b.data.fileId).filter(Boolean) as string[];
  const [qz, asg, fl] = await Promise.all([
    blockIds.length ? db.select().from(quizzes).where(inArray(quizzes.blockId, blockIds)) : [],
    blockIds.length ? db.select().from(assignments).where(inArray(assignments.blockId, blockIds)) : [],
    fileIds.length ? db.select().from(files).where(inArray(files.id, fileIds)) : [],
  ]);
  const videos = new Map(
    await Promise.all(blocks.filter((b) => b.type === 'video').map(async (b) => [b.id, (await videoSource(b.data.mediaId)).source] as const)),
  );
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <nav className="space-y-4">
        {snap.modules.map((m) => (
          <div key={m.id}>
            <p className="mb-1 px-1 text-sm font-semibold">
              <span className="text-fg-muted">{t('common.weekN', { n: m.week })}.</span> {m.title}
            </p>
            <ul className="overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {m.lessons.map((l) => (
                <li key={l.id} className="border-b border-border last:border-0">
                  <Link href={`${basePath}?lesson=${l.id}`} className={cn('block px-3 py-2.5 hover:bg-surface-2', l.id === lesson?.id && 'bg-brand-soft font-semibold text-brand')}>
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {lesson ? (
        <article className="min-w-0 space-y-5">
          <h2 className="text-xl font-bold">{lesson.title}</h2>
          {lesson.blocks.map((b) => {
            const head = b.title ? (
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold">{b.title}</h3>
                {b.required && <Badge tone="brand">{t('learn.required')}</Badge>}
              </div>
            ) : null;
            if (b.type === 'video') {
              const s = videos.get(b.id);
              return (
                <section key={b.id}>
                  {head}
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                    {s?.kind === 'bunny' && <iframe src={s.src} title={b.title} className="absolute inset-0 h-full w-full" allowFullScreen />}
                    {s?.kind === 'youtube' && <iframe src={`https://www.youtube.com/embed/${s.videoId}`} title={b.title} className="absolute inset-0 h-full w-full" allowFullScreen />}
                    {s?.kind === 'html5' && <video src={s.src} controls className="absolute inset-0 h-full w-full" />}
                    {s?.kind === 'pending' && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">{t('learn.video.missing')}</p>}
                  </div>
                </section>
              );
            }
            if (b.type === 'text')
              return (
                <section key={b.id}>
                  {head}
                  <Card className="p-5">
                    <div className="prose-lesson" dangerouslySetInnerHTML={{ __html: cleanHtml(b.data.html ?? '') }} />
                  </Card>
                </section>
              );
            if (b.type === 'file') {
              const f = fl.find((x) => x.id === b.data.fileId);
              return (
                <section key={b.id}>
                  {head}
                  {f ? (
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand hover:underline">
                      <FileText className="size-5" /> {f.filename} ({formatBytes(f.size)})
                    </a>
                  ) : (
                    <p className="text-sm text-fg-muted">{t('learn.file.missing')}</p>
                  )}
                </section>
              );
            }
            if (b.type === 'link')
              return (
                <a key={b.id} href={b.data.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-brand/40">
                  <ExternalLink className="size-5 text-info" />
                  <span>
                    <span className="block font-semibold">{b.title || b.data.url}</span>
                    {b.data.description && <span className="block text-sm text-fg-muted">{b.data.description}</span>}
                  </span>
                </a>
              );
            if (b.type === 'quiz') {
              const q = qz.find((x) => x.blockId === b.id);
              return (
                <Card key={b.id} className="flex items-center gap-3 p-4">
                  <ClipboardCheck className="size-6 text-brand" />
                  <div>
                    <p className="font-semibold">{b.title || t('enums.blockType.quiz')}</p>
                    {q && (
                      <p className="text-sm text-fg-muted">
                        {t('learn.quiz.questions', { n: q.countEasy + q.countMedium + q.countHard })} · {q.timeLimitMin ? t('learn.quiz.timeLimit', { n: q.timeLimitMin }) : t('learn.quiz.noTimeLimit')} ·{' '}
                        {t('learn.quiz.attempts', { used: 0, total: q.attemptsAllowed })}
                      </p>
                    )}
                  </div>
                </Card>
              );
            }
            if (b.type === 'assignment') {
              const a = asg.find((x) => x.blockId === b.id);
              return (
                <Card key={b.id} className="p-4">
                  <p className="mb-1 flex items-center gap-2 font-semibold">
                    <ListChecks className="size-5 text-brand" />
                    {b.title || t('enums.blockType.assignment')}
                  </p>
                  {a?.instructions && <p className="text-sm whitespace-pre-wrap">{a.instructions}</p>}
                  {a?.criteria && <p className="mt-2 text-sm whitespace-pre-wrap text-fg-muted">{a.criteria}</p>}
                </Card>
              );
            }
            return null;
          })}
        </article>
      ) : (
        <p className="text-fg-muted">{t('studio.builder.empty')}</p>
      )}
    </div>
  );
}
