import { Link } from "react-router";

import type { ImageAttempt } from "../types";

type ImageAttemptsPanelProps = {
  attempts: ImageAttempt[];
  chapterId: string;
  selectedAttemptId: string;
  versionId: string;
};

export function ImageAttemptsPanel({ attempts, chapterId, selectedAttemptId, versionId }: ImageAttemptsPanelProps) {
  return (
    <section className="image-attempts-panel" aria-label="Attempt history">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Attempt History</h2>
          <p>Current PromptVersion upload lineage.</p>
        </div>
        <span>{attempts.length} attempts</span>
      </div>

      {attempts.length > 0 ? (
        <div className="image-attempt-list">
          {attempts.map((attempt, index) => {
            const label = attemptLabel(attempt, index);
            return (
              <Link
                key={attempt.id}
                aria-label={`${label} ${attempt.status}`}
                className={attempt.id === selectedAttemptId ? "is-active" : ""}
                to={`/course-planner/chapters/${chapterId}/versions/${versionId}/attempts/${attempt.id}`}
              >
                <strong>{label}</strong>
                <span>{attempt.status}</span>
                <small>{attempt.uploadedImageId}</small>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="course-planner-empty">No image attempts uploaded for this PromptVersion.</p>
      )}
    </section>
  );
}

function attemptLabel(attempt: ImageAttempt, index: number): string {
  const suffix = attempt.id.match(/(\d+)$/)?.[1];
  return `Attempt ${suffix ? suffix.padStart(3, "0") : String(index + 1).padStart(3, "0")}`;
}
