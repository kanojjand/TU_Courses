/**
 * Допуск к рубежному контролю (раздел 5.3, п. 4): пройдены обязательные уроки
 * модулей до недели РК и просмотрены видео не меньше порога (по умолчанию 90%).
 */
export type AdmissionLesson = { id: string; week: number; required: boolean };
export type AdmissionVideo = { blockId: string; lessonId: string; week: number; required: boolean };

export function rkAdmission(input: {
  rkWeek: number;
  lessons: AdmissionLesson[];
  completedLessonIds: Set<string>;
  videos: AdmissionVideo[];
  videoPercent: Map<string, number>;
  videoThreshold: number;
}) {
  const lessons = input.lessons.filter((l) => l.required && l.week <= input.rkWeek);
  const videos = input.videos.filter((v) => v.required && v.week <= input.rkWeek);
  const missingLessons = lessons.filter((l) => !input.completedLessonIds.has(l.id)).length;
  const missingVideos = videos.filter((v) => (input.videoPercent.get(v.blockId) ?? 0) < input.videoThreshold).length;
  return {
    admitted: missingLessons === 0 && missingVideos === 0,
    missingLessons,
    missingVideos,
    totalLessons: lessons.length,
    totalVideos: videos.length,
  };
}
