import { ExportSummary, SourceMetadata, WorkspaceElement } from "../workspace";

type PipelineRailProps = {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
  exportSummary: ExportSummary | null;
};

type StageState = "done" | "active" | "pending";

type PipelineStage = {
  name: string;
  detail: string;
  state: StageState;
};

export function PipelineRail({
  source,
  elements,
  exportSummary,
}: PipelineRailProps) {
  const stages = buildStages(source, elements, exportSummary);

  return (
    <nav className="pipeline-rail" aria-label="Pipeline stages">
      <ol>
        {stages.map((stage, index) => (
          <li key={stage.name} className={`pipeline-stage is-${stage.state}`}>
            <span className="stage-index">{index + 1}</span>
            <div className="stage-copy">
              <strong>{stage.name}</strong>
              <span>{stage.detail}</span>
            </div>
            {stage.state === "done" ? (
              <span className="stage-state-label">Done</span>
            ) : stage.state === "active" ? (
              <span className="stage-state-label">Active</span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function buildStages(
  source: SourceMetadata | null,
  elements: WorkspaceElement[],
  exportSummary: ExportSummary | null,
): PipelineStage[] {
  const activeElements = elements.filter(isActivePipelineElement);
  const detectionCount = activeElements.length;
  const reviewNeededCount = elements.filter(needsReview).length;
  const reviewedCount = Math.max(detectionCount - reviewNeededCount, 0);
  const maskReadyCount = elements.filter(hasSegmentationReady).length;
  const segmentableCount = elements.filter(isSegmentableElement).length;
  const pendingMaskCount = Math.max(segmentableCount - maskReadyCount, 0);
  const exportedCount =
    exportSummary?.exportedElements.length
    ?? elements.filter((element) => element.status === "exported").length;
  const hasSource = source !== null;
  const hasDetections = detectionCount > 0;
  const isReviewComplete = hasDetections && reviewNeededCount === 0;
  const canSegment = isReviewComplete && segmentableCount > 0;
  const segmentDetail = !hasDetections
    ? "Prepare accepted masks"
    : reviewNeededCount > 0
      ? "Finish review first"
        : segmentableCount === 0
          ? "Accept assets first"
          : pendingMaskCount > 0
          ? `${pendingMaskCount} accepted asset${pendingMaskCount === 1 ? " needs" : "s need"} masks`
          : maskReadyCount > 0
            ? `${maskReadyCount} mask${maskReadyCount === 1 ? "" : "s"} ready`
            : "Prepare accepted masks";

  return [
    {
      name: "Upload",
      detail: source ? source.filename : "Awaiting source",
      state: hasSource ? "done" : "active",
    },
    {
      name: "Detect",
      detail: detectionCount > 0
        ? `${detectionCount} candidate${detectionCount === 1 ? "" : "s"}`
        : hasSource
          ? "Ready for model detection"
          : "Needs source",
      state: hasDetections ? "done" : hasSource ? "active" : "pending",
    },
    {
      name: "Review",
      detail: hasDetections
        ? `${reviewedCount} of ${detectionCount} reviewed`
        : "Review candidates",
      state: isReviewComplete
        ? "done"
        : hasDetections
          ? "active"
          : "pending",
    },
    {
      name: "Segment",
      detail: segmentDetail,
      state: canSegment && pendingMaskCount > 0
        ? "active"
        : canSegment && maskReadyCount > 0
          ? "done"
          : "pending",
    },
    {
      name: "Export",
      detail: exportedCount > 0
        ? `${exportedCount} exported`
        : exportSummary
          ? `${exportSummary.blockedCount} blocked`
          : "Export assets",
      state: exportedCount > 0 ? "done" : maskReadyCount > 0 ? "active" : "pending",
    },
  ];
}

function isActivePipelineElement(element: WorkspaceElement): boolean {
  return element.mergedInto === null && element.mode !== "rejected" && element.status !== "rejected";
}

function needsReview(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element)) {
    return false;
  }
  return ["model_detected", "proposal", "edited", "child", "merged", "qa_failed"].includes(element.status);
}

function isSegmentableElement(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element)) {
    return false;
  }
  return [
    "accepted",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
    "qa_failed",
    "exported",
  ].includes(element.status);
}

function hasSegmentationReady(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element)) {
    return false;
  }
  return Boolean(element.mask)
    || ["extract_ready", "extracted", "repair_pending", "repair_complete", "qa_failed", "exported"].includes(
      element.status,
    );
}
