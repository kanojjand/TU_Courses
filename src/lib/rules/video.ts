/** Учёт просмотра видео: отрезки [начало, конец] в секундах, без двойного счёта */
export type Segment = [number, number];

export function normalizeSegments(segments: Segment[], duration?: number | null): Segment[] {
  const max = duration && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const clean = segments
    .map(([a, b]) => [Math.max(0, Math.min(a, b)), Math.min(max, Math.max(a, b))] as Segment)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Segment[] = [];
  for (const s of clean) {
    const last = out[out.length - 1];
    // Соседние отрезки с зазором до секунды склеиваем
    if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}

export function mergeSegments(existing: Segment[], incoming: Segment[], duration?: number | null): Segment[] {
  return normalizeSegments([...existing, ...incoming], duration);
}

export function watchedSeconds(segments: Segment[]) {
  return segments.reduce((s, [a, b]) => s + (b - a), 0);
}

export function watchedPercent(segments: Segment[], duration: number | null | undefined) {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.round((watchedSeconds(segments) / duration) * 1000) / 10);
}

/** Защита от подделки: за один запрос нельзя «посмотреть» больше, чем прошло времени */
export function plausibleIncoming(incoming: Segment[], elapsedSec: number, playbackRate = 2.5): Segment[] {
  const limit = Math.max(5, elapsedSec * playbackRate);
  let budget = limit;
  const out: Segment[] = [];
  for (const [a, b] of incoming) {
    if (budget <= 0) break;
    const len = Math.min(b - a, budget);
    if (len > 0) out.push([a, a + len]);
    budget -= len;
  }
  return out;
}
