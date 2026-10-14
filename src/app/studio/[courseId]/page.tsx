import { CourseBuilder } from '@/components/studio/course-builder';
import { builderTree } from '@/lib/studio';

export default async function BuilderPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const tree = await builderTree(courseId);
  return <CourseBuilder courseId={courseId} initial={tree} />;
}
