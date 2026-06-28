import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import { ImageAttemptsPanel } from "../components/ImageAttemptsPanel";
import { useCoursePlannerState } from "../hooks/useCoursePlannerState";
import type { Chapter, CoursePlannerState, ImageAttempt, PromptVersion, ScenePack } from "../types";

export function ImageAttemptReviewPage() {
  const { attemptId = "", chapterId = "", versionId = "" } = useParams();
  const planner = useCoursePlannerState();
  const lineage = useMemo(
    () => resolveAttemptLineage(planner.state, chapterId, versionId, attemptId),
    [attemptId, chapterId, planner.state, versionId],
  );

  if (!lineage) {
    return (
      <main className="image-attempt-review-page">
        <div className="chapter-workspace-page-header">
          <Link to={chapterId ? versionBackPath(chapterId, versionId) : "/course-planner"}>Back to Version</Link>
          <div>
            <h1>Image Attempt not found</h1>
            <p>Select an uploaded Image Attempt from a Prompt Version.</p>
          </div>
        </div>
      </main>
    );
  }

  const { attempt, attempts, chapter, promptVersion, scenePack } = lineage;
  const reviewState = planner.asyncStatus[`reviewAttempt:${attempt.id}`]?.status;
  const importState = planner.asyncStatus[`importAttempt:${attempt.id}`]?.status;
  const updateState = planner.asyncStatus[`updateAttempt:${attempt.id}`]?.status;
  const isReviewing = reviewState === "pending";
  const isImporting = importState === "pending";
  const isUpdating = updateState === "pending";

  return (
    <main className="image-attempt-review-page">
      <div className="chapter-workspace-page-header">
        <Link to={versionBackPath(chapter.id, promptVersion.id)}>Back to Version</Link>
        <div>
          <h1>Image Attempt Review</h1>
          <LineageNav scenePack={scenePack} chapter={chapter} promptVersion={promptVersion} attempt={attempt} />
        </div>
        <span>{attempt.status}</span>
      </div>

      <div className="image-attempt-review-grid">
        <ImageAttemptsPanel
          attempts={attempts}
          chapterId={chapter.id}
          selectedAttemptId={attempt.id}
          versionId={promptVersion.id}
        />
        <ImagePreviewPanel attempt={attempt} promptVersion={promptVersion} />
        <ReviewImportPanel
          attempt={attempt}
          isImporting={isImporting}
          isReviewing={isReviewing}
          isUpdating={isUpdating}
          promptVersion={promptVersion}
          onImport={() => void planner.importImageAttempt(attempt.id)}
          onKeepRecord={() => void planner.updateImageAttempt(attempt.id, { humanDecision: "keep_record" })}
          onMarkNotAccepted={() => void planner.updateImageAttempt(attempt.id, { status: "not_accepted", humanDecision: "revise_version" })}
          onDeleteDecision={() => void planner.updateImageAttempt(attempt.id, { status: "not_accepted", humanDecision: "delete" })}
          onReview={() => void planner.reviewImageAttempt(attempt.id)}
        />
      </div>
    </main>
  );
}

type AttemptLineage = {
  attempt: ImageAttempt;
  attempts: ImageAttempt[];
  chapter: Chapter;
  promptVersion: PromptVersion;
  scenePack: ScenePack;
};

function resolveAttemptLineage(
  state: CoursePlannerState,
  chapterId: string,
  versionId: string,
  attemptId: string,
): AttemptLineage | null {
  const chapter = findChapter(state, chapterId);
  const promptVersion = state.promptVersionsByChapterId[chapterId]?.find((version) => version.id === versionId) ?? null;
  const attempts = state.imageAttemptsByVersionId[versionId] ?? [];
  const attempt = attempts.find((candidate) => candidate.id === attemptId) ?? null;
  const scenePack = chapter ? state.scenePacks.find((pack) => pack.id === chapter.scenePackId) ?? null : null;

  // WHY: Page 03 是导入血缘的审查点；所有展示和动作都从 URL 指定的 Chapter/Version/Attempt 收窄，避免复用全局 selected 状态误导入。
  if (!chapter || !promptVersion || !attempt || !scenePack || attempt.promptVersionId !== promptVersion.id) {
    return null;
  }
  return { attempt, attempts, chapter, promptVersion, scenePack };
}

function LineageNav({
  attempt,
  chapter,
  promptVersion,
  scenePack,
}: {
  attempt: ImageAttempt;
  chapter: Chapter;
  promptVersion: PromptVersion;
  scenePack: ScenePack;
}) {
  return (
    <nav className="image-attempt-lineage" aria-label="Image attempt lineage">
      <span>{scenePack.title}</span>
      <span>{chapter.title}</span>
      <span>
        {promptVersion.versionLabel} - {promptVersion.title}
      </span>
      <span>{attempt.id}</span>
    </nav>
  );
}

function ImagePreviewPanel({ attempt, promptVersion }: { attempt: ImageAttempt; promptVersion: PromptVersion }) {
  const [fitMode, setFitMode] = useState<"fit" | "actual" | "zoomed">("fit");
  const imageSource = previewableImageSource(attempt.uploadedImageId);

  return (
    <section className={`image-attempt-preview image-attempt-preview-${fitMode}`} aria-label="Uploaded image preview">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Uploaded Image</h2>
          <p>{attempt.uploadedImageId}</p>
        </div>
        <div className="chapter-workspace-actions" aria-label="Preview controls">
          <button type="button" onClick={() => setFitMode("fit")}>
            Fit
          </button>
          <button type="button" onClick={() => setFitMode("actual")}>
            Zoom 100%
          </button>
          <button type="button" onClick={() => setFitMode("zoomed")}>
            Zoom 150%
          </button>
        </div>
      </div>

      {imageSource ? (
        <img src={imageSource} alt={`Uploaded image for ${attempt.id}`} />
      ) : (
        <div className="course-planner-empty">
          <strong>Image preview unavailable</strong>
          <p>Preview can be enabled once this attempt exposes a resolvable image URL.</p>
        </div>
      )}

      <div className="image-attempt-prompt-snapshot">
        <h3>Prompt Package Used</h3>
        <p>{promptVersion.promptPackage.fullPrompt}</p>
        <small>{promptVersion.promptPackage.negativeConstraints}</small>
      </div>
    </section>
  );
}

function ReviewImportPanel({
  attempt,
  isImporting,
  isReviewing,
  isUpdating,
  onDeleteDecision,
  onImport,
  onKeepRecord,
  onMarkNotAccepted,
  onReview,
  promptVersion,
}: {
  attempt: ImageAttempt;
  isImporting: boolean;
  isReviewing: boolean;
  isUpdating: boolean;
  onDeleteDecision: () => void;
  onImport: () => void;
  onKeepRecord: () => void;
  onMarkNotAccepted: () => void;
  onReview: () => void;
  promptVersion: PromptVersion;
}) {
  const review = attempt.aiReview;
  const isBusy = isReviewing || isImporting || isUpdating;
  const reviewButtonLabel = isReviewing
    ? "Reviewing..."
    : review
      ? "Rerun AI Review"
      : "Run AI Review";

  return (
    <section className="image-attempt-review-controls" aria-label="Review and import controls">
      <div className="chapter-workspace-panel-header">
        <div>
          <h2>Review / Import</h2>
          <p>Decision applies only to this Image Attempt.</p>
        </div>
        <span>{promptVersion.versionLabel}</span>
      </div>

      <div className="image-attempt-review-summary">
        <h3>AI Review Checklist</h3>
        {review ? (
          <>
            <p>{review.summary}</p>
            <Checklist title="Strengths" items={review.strengths} />
            <Checklist title="Issues" items={review.issues} />
            {review.recommendation ? <strong>{review.recommendation}</strong> : null}
          </>
        ) : (
          <p className="course-planner-empty">No AI review yet. Run review before importing when quality is uncertain.</p>
        )}
      </div>

      <div className="chapter-workspace-actions">
        <button type="button" disabled={isBusy} onClick={onReview}>
          {reviewButtonLabel}
        </button>
        <button type="button" disabled={isBusy} onClick={onImport}>
          {isImporting ? "Importing..." : "Accept / Import to Pipeline"}
        </button>
        <button type="button" disabled={isBusy} onClick={onMarkNotAccepted}>
          Mark Not Accepted
        </button>
        <button type="button" disabled={isBusy} onClick={onKeepRecord}>
          Keep Record
        </button>
        <button type="button" disabled={isBusy} onClick={onDeleteDecision}>
          Delete Attempt
        </button>
      </div>

      {attempt.humanDecision ? <p>Human decision: {humanDecisionLabel(attempt.humanDecision)}</p> : null}
      {attempt.pipelineImportId ? <p>Pipeline import: {attempt.pipelineImportId}</p> : null}
      <Link to={versionBackPath(promptVersion.chapterId, promptVersion.id)}>Return to Page 02 version</Link>
    </section>
  );
}

function humanDecisionLabel(decision: NonNullable<ImageAttempt["humanDecision"]>): string {
  if (decision === "revise_version") {
    return "not accepted";
  }
  if (decision === "keep_record") {
    return "keep record";
  }
  return decision;
}

function Checklist({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function findChapter(state: CoursePlannerState, chapterId: string): Chapter | null {
  return Object.values(state.chaptersByScenePackId).flat().find((chapter) => chapter.id === chapterId) ?? null;
}

function previewableImageSource(uploadedImageId: string): string | null {
  if (/^(https?:|data:image\/|blob:|\/)/.test(uploadedImageId)) {
    return uploadedImageId;
  }
  if (uploadedImageId.startsWith("uploads/course_planner/")) {
    return `/api/course-planner/uploads/${encodeUploadAssetPath(uploadedImageId)}`;
  }
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(uploadedImageId) ? uploadedImageId : null;
}

function encodeUploadAssetPath(uploadedImageId: string): string {
  return uploadedImageId.split("/").map(encodeURIComponent).join("/");
}

function versionBackPath(chapterId: string, versionId: string): string {
  return versionId
    ? `/course-planner/chapters/${chapterId}?versionId=${versionId}`
    : `/course-planner/chapters/${chapterId}`;
}
