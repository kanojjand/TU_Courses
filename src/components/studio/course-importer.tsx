'use client';

import { AlertTriangle, Archive, CheckCircle2, ClipboardCheck, Download, FileText, FolderOpen, Link2, ListChecks, Loader2, Type, Video, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BlockType } from '@/db/schema';
import { parseCourseTable, type TableIssue, type TableModule } from '@/lib/import/course-table';
import { baseName, extOf, parseVideoName } from '@/lib/rules/filenames';
import { MAX_UPLOAD_BYTES, uploadFile } from '@/lib/upload-client';
import { formatBytes } from '@/lib/utils';
import { uploadVideo } from '@/lib/video-upload-client';
import { readZip, stripCommonRoot } from '@/lib/zip-reader';
import { applyCourseTableAction, applyVideoFolderAction, importQuizFileAction, readCourseTableAction } from '@/server/import-course-actions';
import { updateBlockAction } from '@/server/studio-actions';

type VFile = { path: string; size: number; blob: () => Promise<Blob> };
type Job = { key: string; name: string; kind: 'video' | 'file' | 'quiz'; status: 'wait' | 'run' | 'done' | 'error' | 'skip'; progress: number; note?: string };

const ICON: Record<BlockType, React.ComponentType<{ className?: string }>> = { video: Video, text: Type, file: FileText, quiz: ClipboardCheck, assignment: ListChecks, link: Link2 };

export function CourseImporter({ courseId, bunny }: { courseId: string; bunny: boolean }) {
  const t = useTranslations('studio.import');
  const tc = useTranslations('common');
  const tb = useTranslations('enums.blockType');
  const router = useRouter();
  const [stage, setStage] = useState<'pick' | 'checking' | 'preview' | 'videos' | 'upload' | 'done'>('pick');
  const [vfs, setVfs] = useState<Map<string, VFile>>(new Map());
  const [tree, setTree] = useState<TableModule[]>([]);
  const [issues, setIssues] = useState<{ row?: number; text: string }[]>([]);
  const [videoItems, setVideoItems] = useState<{ file: File; module: number; lesson: number; part: number }[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);

  const issueText = (i: TableIssue) => t(`issue.${i.code}`, { file: '', value: '', column: '', ...(i.params ?? {}) });

  async function loadFiles(files: VFile[]) {
    setStage('checking');
    setFatal(null);
    const root = stripCommonRoot(files.map((f) => f.path));
    const map = new Map(files.map((f) => [f.path.slice(root.length), { ...f, path: f.path.slice(root.length) }]));
    setVfs(map);
    const table = [...map.values()]
      .filter((f) => /(^|\/)course\.(xlsx|csv)$/i.test(f.path))
      .sort((a, b) => a.path.length - b.path.length)[0];
    if (!table) {
      setFatal(t('noTable'));
      setStage('pick');
      return;
    }
    const fd = new FormData();
    fd.append('file', new File([await table.blob()], baseName(table.path)));
    const res = await readCourseTableAction(fd);
    if ('error' in res) {
      setFatal(tc('somethingWrong'));
      setStage('pick');
      return;
    }
    const parsed = parseCourseTable(res.rows ?? [], [...map.keys()]);
    const list: { row?: number; text: string }[] = parsed.issues.map((i) => ({ row: i.row, text: issueText(i) }));
    for (const m of parsed.modules)
      for (const l of m.lessons)
        for (const b of l.blocks) {
          if (b.type === 'video' && !bunny) list.push({ row: b.rowNo, text: t('issue.noBunny', { file: b.value }) });
          const f = map.get(b.value);
          if (f && b.type === 'file' && f.size > MAX_UPLOAD_BYTES) list.push({ row: b.rowNo, text: t('issue.tooBig', { file: b.value }) });
        }
    setTree(parsed.modules);
    setIssues(list.sort((a, b) => (a.row ?? 0) - (b.row ?? 0)));
    setStage('preview');
  }

  async function onZip(file: File) {
    try {
      const entries = await readZip(file);
      await loadFiles(entries.map((e) => ({ path: e.path, size: e.size, blob: e.blob })));
    } catch {
      setFatal(tc('somethingWrong'));
      setStage('pick');
    }
  }

  function onFolder(list: FileList) {
    const files = Array.from(list).map((f) => ({ path: (f as File & { webkitRelativePath: string }).webkitRelativePath || f.name, size: f.size, blob: async () => f as Blob }));
    void loadFiles(files);
  }

  function onVideos(list: FileList) {
    const items: typeof videoItems = [];
    const bad: { text: string }[] = [];
    for (const f of Array.from(list)) {
      const p = parseVideoName(f.name);
      if (p) items.push({ file: f, module: p.module, lesson: p.lesson, part: p.part });
      else if (/\.(mp4|mov|m4v|mkv|webm|avi|wmv)$/i.test(f.name)) bad.push({ text: t('issue.badName', { file: f.name }) });
    }
    setVideoItems(items.sort((a, b) => a.module - b.module || a.lesson - b.lesson || a.part - b.part));
    setIssues(bunny ? bad : [...bad, ...items.map((i) => ({ text: t('issue.noBunny', { file: i.file.name }) }))]);
    setStage('videos');
  }

  const update = (key: string, patch: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  async function runCreate() {
    setStage('upload');
    const { blocks } = await applyCourseTableAction(courseId, tree);
    const list: Job[] = blocks.map((b) => ({ key: b.blockId, name: b.value, kind: b.type as Job['kind'], status: vfs.has(b.value) ? 'wait' : 'skip', progress: 0 }));
    setJobs(list);
    // Сначала лёгкие файлы и тесты, затем видео по одному
    const ordered = [...blocks].sort((a, b) => (a.type === 'video' ? 1 : 0) - (b.type === 'video' ? 1 : 0));
    for (const b of ordered) {
      const vf = vfs.get(b.value);
      if (!vf) continue;
      update(b.blockId, { status: 'run' });
      try {
        const file = new File([await vf.blob()], baseName(vf.path), { type: guessMime(vf.path) });
        if (b.type === 'quiz') {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('blockId', b.blockId);
          fd.append('title', b.title || baseName(vf.path));
          const res = await importQuizFileAction(courseId, fd);
          if ('error' in res) throw new Error(res.error);
          update(b.blockId, { status: 'done', progress: 100, note: `${res.count}` });
        } else if (b.type === 'file') {
          if (file.size > MAX_UPLOAD_BYTES) throw new Error(t('issue.tooBig', { file: b.value }));
          const up = await uploadFile(file, { prefix: 'materials', onProgress: (p) => update(b.blockId, { progress: p }) });
          await updateBlockAction(b.blockId, { fileId: up.id });
          update(b.blockId, { status: 'done', progress: 100 });
        } else if (b.type === 'video') {
          if (!bunny) {
            update(b.blockId, { status: 'skip' });
            continue;
          }
          const res = await uploadVideo({ courseId, file, blockId: b.blockId, onProgress: (p) => update(b.blockId, { progress: p }) });
          if ('error' in res) throw new Error(res.error);
          update(b.blockId, { status: 'done', progress: 100 });
        }
      } catch (e) {
        update(b.blockId, { status: 'error', note: String((e as Error).message ?? e).slice(0, 120) });
      }
    }
    setStage('done');
    router.refresh();
  }

  async function runVideos() {
    setStage('upload');
    const { files } = await applyVideoFolderAction(
      courseId,
      videoItems.map((v) => ({ filename: v.file.name, module: v.module, lesson: v.lesson, part: v.part })),
    );
    setJobs(files.map((f) => ({ key: f.blockId, name: f.filename, kind: 'video', status: bunny ? 'wait' : 'skip', progress: 0 })));
    if (bunny) {
      for (const f of files) {
        const item = videoItems.find((v) => v.file.name === f.filename);
        if (!item) continue;
        update(f.blockId, { status: 'run' });
        const res = await uploadVideo({ courseId, file: item.file, blockId: f.blockId, onProgress: (p) => update(f.blockId, { progress: p }) });
        update(f.blockId, 'error' in res ? { status: 'error', note: res.error } : { status: 'done', progress: 100 });
      }
    }
    setStage('done');
    router.refresh();
  }

  const counts = { m: tree.length, l: tree.reduce((s, m) => s + m.lessons.length, 0), b: tree.reduce((s, m) => s + m.lessons.reduce((x, l) => x + l.blocks.length, 0), 0) };

  return (
    <div className="space-y-5">
      {(stage === 'pick' || stage === 'checking') && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <Archive className="size-7 text-brand" />
              <div>
                <p className="font-semibold">{t('way1')}</p>
                <p className="text-sm text-fg-muted">{t('way1Hint')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={buttonClass('primary')}>
                {stage === 'checking' ? <Loader2 className="animate-spin" /> : <Archive />}
                {t('chooseZip')}
                <input type="file" accept=".zip,application/zip" className="sr-only" disabled={stage === 'checking'} onChange={(e) => e.target.files?.[0] && onZip(e.target.files[0])} />
              </label>
              <label className={buttonClass('secondary')}>
                <FolderOpen />
                {t('chooseFolder')}
                <input
                  type="file"
                  className="sr-only"
                  disabled={stage === 'checking'}
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  multiple
                  onChange={(e) => e.target.files && onFolder(e.target.files)}
                />
              </label>
              <a href="/api/templates/course" className={buttonClass('ghost')}>
                <Download />
                {t('templateCsv')}
              </a>
            </div>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-3">
              <Video className="size-7 text-brand" />
              <div>
                <p className="font-semibold">{t('way2')}</p>
                <p className="text-sm text-fg-muted">{t('way2Hint')}</p>
              </div>
            </div>
            <label className={buttonClass('secondary')}>
              <Video />
              {t('chooseVideos')}
              <input type="file" accept="video/*" multiple className="sr-only" onChange={(e) => e.target.files && onVideos(e.target.files)} />
            </label>
          </Card>
          {stage === 'checking' && <p className="text-sm text-fg-muted md:col-span-2">{t('checking')}</p>}
          {fatal && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger md:col-span-2">{fatal}</p>}
        </div>
      )}

      {stage === 'preview' && (
        <>
          <Card className="p-5">
            <p className="mb-1 font-semibold">{t('tree')}</p>
            <p className="mb-4 text-sm text-fg-muted">{t('willCreate', counts)}</p>
            <ol className="space-y-3">
              {tree.map((m) => (
                <li key={m.no}>
                  <p className="font-medium">
                    <span className="text-fg-muted">{tc('weekN', { n: m.week })}.</span> {m.title}
                  </p>
                  <ul className="mt-1 ml-4 space-y-1 border-l border-border pl-3">
                    {m.lessons.map((l) => (
                      <li key={l.no}>
                        <p className="text-sm">{l.title}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1.5">
                          {l.blocks.map((b) => {
                            const I = ICON[b.type];
                            const missing = (b.type === 'video' || b.type === 'file' || b.type === 'quiz') && !vfs.has(b.value);
                            return (
                              <Badge key={b.rowNo} tone={missing ? 'danger' : 'neutral'} title={b.value}>
                                <I className="size-3.5" />
                                {b.title || tb(b.type)}
                              </Badge>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>
          <IssueList issues={issues} title={t('problems')} ok={t('noProblems')} rowLabel={(n) => t('row', { n })} />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={runCreate} disabled={counts.b === 0}>
              {issues.length ? t('createAnyway') : t('create')}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setStage('pick')}>
              {tc('back')}
            </Button>
          </div>
          <p className="text-sm text-fg-muted">{t('replaceWarning')}</p>
        </>
      )}

      {stage === 'videos' && (
        <>
          <Card className="p-5">
            <p className="mb-3 font-semibold">{t('videosFound', { n: videoItems.length })}</p>
            <ul className="space-y-1 text-sm">
              {videoItems.map((v) => (
                <li key={v.file.name} className="flex flex-wrap items-center gap-2">
                  <Badge>
                    M{String(v.module).padStart(2, '0')} · L{String(v.lesson).padStart(2, '0')}
                    {v.part > 1 ? ` · ${v.part}` : ''}
                  </Badge>
                  {v.file.name}
                  <span className="text-fg-muted">{formatBytes(v.file.size)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <IssueList issues={issues} title={t('problems')} ok={t('noProblems')} rowLabel={(n) => t('row', { n })} />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={runVideos} disabled={videoItems.length === 0}>
              {t('create')}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setStage('pick')}>
              {tc('back')}
            </Button>
          </div>
        </>
      )}

      {(stage === 'upload' || stage === 'done') && (
        <Card className="p-5">
          <p className="mb-1 font-semibold">{t('progressTitle')}</p>
          {stage === 'done' && <p className="mb-3 text-sm text-success">{t('allDone')}</p>}
          <ul className="divide-y divide-border">
            {jobs.map((j) => (
              <li key={j.key} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                {j.status === 'done' ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : j.status === 'error' ? (
                  <XCircle className="size-5 text-danger" />
                ) : j.status === 'skip' ? (
                  <AlertTriangle className="size-5 text-warning" />
                ) : j.status === 'run' ? (
                  <Loader2 className="size-5 animate-spin text-brand" />
                ) : (
                  <span className="size-5 rounded-full border-2 border-border" />
                )}
                <span className="min-w-0 flex-1 truncate">{j.name}</span>
                {j.status === 'run' && <Progress value={j.progress} className="w-32" />}
                {j.note && <span className="text-xs text-fg-muted">{j.note}</span>}
              </li>
            ))}
          </ul>
          {stage === 'done' && (
            <Link href={`/studio/${courseId}`} className={buttonClass('primary', 'lg', 'mt-4')}>
              {t('openBuilder')}
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}

function IssueList({ issues, title, ok, rowLabel }: { issues: { row?: number; text: string }[]; title: string; ok: string; rowLabel: (n: number) => string }) {
  if (!issues.length)
    return (
      <p className="flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft px-4 py-3 text-sm font-medium text-success">
        <CheckCircle2 className="size-5" />
        {ok}
      </p>
    );
  return (
    <Card className="border-warning/30 p-5">
      <p className="mb-2 flex items-center gap-2 font-semibold text-warning">
        <AlertTriangle className="size-5" />
        {title} ({issues.length})
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
        {issues.map((i, k) => (
          <li key={k}>
            {i.row ? <span className="mr-2 font-medium text-fg-muted">{rowLabel(i.row)}</span> : null}
            {i.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function guessMime(path: string) {
  const e = extOf(path);
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    zip: 'application/zip',
    txt: 'text/plain',
  };
  return map[e] ?? 'application/octet-stream';
}
