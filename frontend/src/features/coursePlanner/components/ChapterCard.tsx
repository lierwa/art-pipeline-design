import { Link } from "react-router";

import type { ChapterProductionStatus } from "../domain/chapterStatus";
import type { Chapter } from "../types";

type ChapterCardProps = {
  chapter: Chapter;
  status: ChapterProductionStatus;
};

export function ChapterCard({ chapter, status }: ChapterCardProps) {
  const placedAssetLabel = `${status.placedAssetCount} ${status.placedAssetCount === 1 ? "asset" : "assets"} placed`;

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
          <dt>Prompt Text</dt>
          <dd>{status.hasPromptText ? "ready" : "missing"}</dd>
        </div>
        <div>
          <dt>Target Objects</dt>
          <dd>{status.targetObjectCount} objects</dd>
        </div>
        <div>
          <dt>Placed Assets</dt>
          <dd>{placedAssetLabel}</dd>
        </div>
        <div>
          <dt>Final Scene</dt>
          <dd>{status.hasFinalScene ? "locked" : "not locked"}</dd>
        </div>
      </dl>
      <div className="chapter-card-actions">
        <Link to={`/course-planner/chapters/${encodeURIComponent(chapter.id)}`}>Open Designer</Link>
      </div>
    </article>
  );
}
