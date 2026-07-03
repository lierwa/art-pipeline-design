import { deriveChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter, ChapterScenePackage } from "../types";
import { ChapterCard } from "./ChapterCard";

type ChapterBoardProps = {
  chapters: Chapter[];
  chapterScenePackagesByChapterId?: Record<string, ChapterScenePackage | null>;
};

export function ChapterBoard({ chapters, chapterScenePackagesByChapterId = {} }: ChapterBoardProps) {
  return (
    <section className="chapter-board" aria-label="Chapter Board">
      {chapters.length > 0 ? (
        chapters.map((chapter) => (
          <ChapterCard
            chapter={chapter}
            key={chapter.id}
            // WHY: ChapterBoard 当前只认 chapter scene package 这一条事实源；
            // 如果页面还没拿到 package，就显式回落为 null，避免 UI 从历史字段反推一套伪状态。
            status={deriveChapterProductionStatus(chapterScenePackagesByChapterId[chapter.id] ?? null)}
          />
        ))
      ) : (
        <p className="course-planner-empty">No chapters in this scene category.</p>
      )}
    </section>
  );
}
