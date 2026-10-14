import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  assignments,
  enrollments,
  externalIds,
  files,
  gradeItems,
  mediaAssets,
  questionBanks,
  questions,
  quizAttempts,
  quizzes,
  submissions,
} from '@/db/schema';
import { bunnyConfig, bunnyEmbedUrl } from './bunny';
import { flattenLessons, type CourseSnapshot, type SnapBlock } from './course';
import { blockStates } from './progress';
import { submissionDecision, type GradeWindow } from './rules/deadlines';

export type VideoSource =
  | { kind: 'bunny'; src: string }
  | { kind: 'youtube'; videoId: string }
  | { kind: 'html5'; src: string }
  | { kind: 'pending'; status: 'uploading' | 'processing' | 'error' | 'missing' };

export function youtubeId(url: string): string | null {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

export async function videoSource(mediaId: string | undefined): Promise<{ source: VideoSource; durationSec: number | null }> {
  if (!mediaId) return { source: { kind: 'pending', status: 'missing' }, durationSec: null };
  const [m] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId));
  if (!m) return { source: { kind: 'pending', status: 'missing' }, durationSec: null };
  if (m.provider === 'external' && m.url) {
    const yt = youtubeId(m.url);
    return { source: yt ? { kind: 'youtube', videoId: yt } : { kind: 'html5', src: m.url }, durationSec: m.durationSec };
  }
  if (m.status !== 'ready' || !m.bunnyVideoId) return { source: { kind: 'pending', status: m.status === 'ready' ? 'missing' : m.status }, durationSec: m.durationSec };
  const cfg = await bunnyConfig();
  if (!cfg) return { source: { kind: 'pending', status: 'error' }, durationSec: m.durationSec };
  return { source: { kind: 'bunny', src: bunnyEmbedUrl(cfg, m.bunnyVideoId) }, durationSec: m.durationSec };
}

/** Окно для блока: самое раннее закрытие среди элементов оценивания потоков студента */
export async function blockWindow(studentId: string, blockId: string): Promise<GradeWindow | null> {
  const rows = await db
    .select({ opensAt: gradeItems.opensAt, dueAt: gradeItems.dueAt, hardCloseAt: gradeItems.hardCloseAt })
    .from(gradeItems)
    .innerJoin(enrollments, and(eq(enrollments.offeringId, gradeItems.offeringId), eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')))
    .where(eq(gradeItems.blockId, blockId));
  if (!rows.length) return null;
  const minDate = (ds: (Date | null)[]) => {
    const v = ds.filter(Boolean) as Date[];
    return v.length ? new Date(Math.min(...v.map((d) => d.getTime()))) : null;
  };
  const maxDate = (ds: (Date | null)[]) => {
    const v = ds.filter(Boolean) as Date[];
    return v.length ? new Date(Math.max(...v.map((d) => d.getTime()))) : null;
  };
  return { opensAt: maxDate(rows.map((r) => r.opensAt)), dueAt: minDate(rows.map((r) => r.dueAt)), hardCloseAt: minDate(rows.map((r) => r.hardCloseAt)) };
}

export async function quizInfo(studentId: string, blockId: string) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.blockId, blockId));
  if (!quiz) return null;
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.studentId, studentId), eq(quizAttempts.quizId, quiz.id)))
    .orderBy(desc(quizAttempts.startedAt));
  let available = 0;
  if (quiz.bankId) {
    const qs = await db.select({ d: questions.difficulty }).from(questions).where(eq(questions.bankId, quiz.bankId));
    const by = (d: number) => qs.filter((q) => q.d === d).length;
    available = Math.min(by(1), quiz.countEasy) + Math.min(by(2), quiz.countMedium) + Math.min(by(3), quiz.countHard);
  }
  const finished = attempts.filter((a) => a.finishedAt);
  const active = attempts.find((a) => !a.finishedAt && (!a.deadlineAt || a.deadlineAt > new Date()));
  const window = await blockWindow(studentId, blockId);
  const decision = window ? submissionDecision(window) : { allowed: true, late: false, timing: 'on_time' as const };
  return {
    quiz,
    questionCount: available,
    used: attempts.length - (active ? 1 : 0),
    best: finished.length ? Math.max(...finished.map((a) => a.score ?? 0)) : null,
    activeAttemptId: active?.id ?? null,
    window,
    decision,
  };
}

export async function assignmentInfo(studentId: string, blockId: string, offeringId: string) {
  const [as] = await db.select().from(assignments).where(eq(assignments.blockId, blockId));
  if (!as) return null;
  const [sub] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.studentId, studentId), eq(submissions.assignmentId, as.id), eq(submissions.offeringId, offeringId)));
  const subFiles = sub?.fileIds.length ? await db.select().from(files).where(inArray(files.id, sub.fileIds)) : [];
  const window = await blockWindow(studentId, blockId);
  const decision = window ? submissionDecision(window) : { allowed: true, late: false, timing: 'on_time' as const };
  return { assignment: as, submission: sub ?? null, files: subFiles.map((f) => ({ id: f.id, name: f.filename, size: f.size })), window, decision };
}

export async function lessonPageData(studentId: string, snap: CourseSnapshot, lessonId: string, offeringId: string) {
  const all = flattenLessons(snap);
  const index = all.findIndex((l) => l.id === lessonId);
  if (index < 0) return null;
  const lesson = all[index];
  const st = await blockStates(
    studentId,
    lesson.blocks.map((b) => b.id),
  );
  const fileIds = lesson.blocks.map((b) => b.data.fileId).filter(Boolean) as string[];
  const fileRows = fileIds.length ? await db.select().from(files).where(inArray(files.id, fileIds)) : [];
  const fileById = new Map(fileRows.map((f) => [f.id, f]));
  const blocks = await Promise.all(
    lesson.blocks.map(async (b: SnapBlock) => {
      if (b.type === 'video') {
        const v = await videoSource(b.data.mediaId);
        return { block: b, video: { ...v, state: st.video.get(b.id) ?? null } };
      }
      if (b.type === 'file') {
        const f = b.data.fileId ? fileById.get(b.data.fileId) : undefined;
        return { block: b, file: f ? { id: f.id, name: f.filename, size: f.size, mime: f.mime } : null };
      }
      if (b.type === 'quiz') return { block: b, quiz: await quizInfo(studentId, b.id) };
      if (b.type === 'assignment') return { block: b, assignment: await assignmentInfo(studentId, b.id, offeringId) };
      return { block: b };
    }),
  );
  return { lesson, index, total: all.length, prev: all[index - 1] ?? null, next: all[index + 1] ?? null, blocks };
}

export async function studentPublicId(userId: string, login: string) {
  const [row] = await db
    .select({ ext: externalIds.externalId })
    .from(externalIds)
    .where(and(eq(externalIds.lmsId, userId), eq(externalIds.entityType, 'student')));
  return row?.ext ?? login;
}

export async function bankTitle(bankId: string | null) {
  if (!bankId) return null;
  const [b] = await db.select({ title: questionBanks.title }).from(questionBanks).where(eq(questionBanks.id, bankId));
  return b?.title ?? null;
}
