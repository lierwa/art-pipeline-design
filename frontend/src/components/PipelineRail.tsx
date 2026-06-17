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

export function PipelineRail({ source, elements, exportSummary }: PipelineRailProps) {
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
  const detectionCount = elements.filter((element) => element.mergedInto === null).length;
  const reviewNeededCount = elements.filter(needsReview).length;
  const reviewedCount = Math.max(detectionCount - reviewNeededCount, 0);
  const maskReadyCount = elements.filter(hasSegmentationReady).length;
  const exportedCount =
    exportSummary?.exportedElements.length
    ?? elements.filter((element) => element.status === "exported").length;

  return [
    {
      name: "Upload",
      detail: source ? `${source.filename} - ${source.width} x ${source.height}` : "Awaiting source",
      state: source ? "done" : "active",
    },
    {
      name: "Detect",
      detail: detectionCount > 0
        ? `${detectionCount} candidate${detectionCount === 1 ? "" : "s"}`
        : source
          ? "Ready for model detection"
          : "Needs source",
      state: detectionCount > 0 ? "done" : source ? "active" : "pending",
    },
    {
      name: "Review",
      detail: detectionCount > 0
        ? `${reviewedCount} of ${detectionCount} reviewed`
        : "Review candidates",
      state: detectionCount > 0 && reviewNeededCount === 0
        ? "done"
        : detectionCount > 0
          ? "active"
          : "pending",
    },
    {
      name: "Segment",
      detail: maskReadyCount > 0
        ? `${maskReadyCount} mask${maskReadyCount === 1 ? "" : "s"} ready`
        : "Prepare accepted masks",
      state: maskReadyCount > 0 ? "done" : reviewedCount > 0 ? "active" : "pending",
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

function needsReview(element: WorkspaceElement): boolean {
  if (element.mode === "rejected" || element.mergedInto !== null) {
    return false;
  }
  return ["model_detected", "proposal", "edited", "qa_failed"].includes(element.status);
}

function hasSegmentationReady(element: WorkspaceElement): boolean {
  if (element.mode === "rejected" || element.mergedInto !== null) {
    return false;
  }
  return Boolean(element.mask)
    || ["extract_ready", "extracted", "repair_pending", "repair_complete", "qa_failed", "exported"].includes(
      element.status,
    );
}
