/**
 * Имена видео по шаблону КОД_M01_L03.mp4 (раздел 6, способ 2).
 * Допускается часть ролика: КОД_M01_L03_2.mp4, регистр не важен,
 * разделитель «_» или «-».
 */
export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv'];
export const DOC_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png'];
export const QUIZ_EXT = ['xlsx', 'csv'];

export function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export type ParsedVideoName = { code: string; module: number; lesson: number; part: number };

export function parseVideoName(fileName: string): ParsedVideoName | null {
  const name = baseName(fileName);
  if (!VIDEO_EXT.includes(extOf(name))) return null;
  const m = /^(.+?)[_-]M(\d{1,3})[_-]L(\d{1,3})(?:[_-](\d{1,2}))?\.[a-z0-9]+$/i.exec(name);
  if (!m) return null;
  return { code: m[1].toUpperCase(), module: Number(m[2]), lesson: Number(m[3]), part: m[4] ? Number(m[4]) : 1 };
}
