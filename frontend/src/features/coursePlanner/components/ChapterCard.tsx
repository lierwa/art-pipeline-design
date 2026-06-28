import { Link } from "react-router";

import type { ChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter } from "../types";

type ChapterCardProps = {
  chapter: Chapter;
  status: ChapterProductionStatus;
};

export function ChapterCard({ chapter, status }: ChapterCardProps) {
  return (
    <article className="chapter-card">
      <div className="chapter-card-header">
        <div>
          <h3>{chapter.title}</h3>
          <p>{chapter.summary}</p>
        </div>
        <span>#{chapter.sortOrder}</span>
      </div>
      <dl>
        <div>
          <dt>Prompt Version</dt>
          <dd>{status.hasPromptVersion ? "version ready" : "version missing"}</dd>
        </div>
        <div>
          <dt>Planned Objects</dt>
          <dd>{status.objectCount} objects</dd>
        </div>
        <div>
          <dt>Image Attempts</dt>
          <dd>
            {status.attemptCount} {status.attemptCount === 1 ? "attempt" : "attempts"}
          </dd>
        </div>
        <div>
          <dt>Pipeline Import</dt>
          <dd>{status.hasImportedAttempt ? "imported" : "not imported"}</dd>
        </div>
      </dl>
      <div className="chapter-card-actions">
        <Link to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}`}>Open Designer</Link>
      </div>
    </article>
  );
}
