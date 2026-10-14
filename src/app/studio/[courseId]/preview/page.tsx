import { CoursePreview } from '@/components/studio/course-preview';
import { loadCourseTree } from '@/lib/course';

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ lesson?: string }> }) {
  const { courseId } = await params;
  const { lesson } = await searchParams;
  const snap = await loadCourseTree(courseId);
  if (!snap) return null;
  return <CoursePreview snap={snap} basePath={`/studio/${courseId}/preview`} lessonId={lesson} />;
}
