import { deriveChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter, CoursePlannerState } from "../types";
import { ChapterCard } from "./ChapterCard";

type ChapterBoardProps = {
  chapters: Chapter[];
  state: CoursePlannerState;
};

export function ChapterBoard({ chapters, state }: ChapterBoardProps) {
  return (
    <section className="chapter-board" aria-label="Chapter Board">
      {chapters.length > 0 ? (
        chapters.map((chapter) => (
          <ChapterCard
            chapter={chapter}
            key={chapter.id}
            status={deriveChapterProductionStatus(state, chapter.id)}
          />
        ))
      ) : (
        <p className="course-planner-empty">No chapters in this scene category.</p>
      )}
    </section>
  );
}
