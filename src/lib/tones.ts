import type { Tone } from '@/components/ui/badge';
import type { BatchStatus, CourseStatus, MediaStatus } from '@/db/schema';

export const COURSE_TONE: Record<CourseStatus, Tone> = { draft: 'neutral', review: 'warning', published: 'success', archived: 'neutral' };
export const MEDIA_TONE: Record<MediaStatus, Tone> = { uploading: 'info', processing: 'warning', ready: 'success', error: 'danger' };
export const BATCH_TONE: Record<BatchStatus, Tone> = { draft: 'neutral', ready: 'info', sent: 'warning', confirmed: 'success', rejected: 'danger' };
export const SYNC_TONE: Record<'running' | 'success' | 'partial' | 'failed', Tone> = { running: 'info', success: 'success', partial: 'warning', failed: 'danger' };
