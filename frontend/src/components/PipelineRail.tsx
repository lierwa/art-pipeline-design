import type { ExportSummary, SourceMetadata, WorkspaceElement } from "../workspace";

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

type PipelineStageDraft = Omit<PipelineStage, "state"> & {
  isComplete: boolean;
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
  const pendingReviewCount = activeElements.filter(needsDetectionReview).length;
  const maskReadyCount = elements.filter(hasSegmentationReady).length;
  const segmentableCount = elements.filter(isSegmentableElement).length;
  const pendingMaskCount = Math.max(segmentableCount - maskReadyCount, 0);
  const repairNeededCount = activeElements.filter(needsRepair).length;
  const repairCompleteCount = activeElements.filter(isRepairComplete).length;
  const exportedCount =
    exportSummary?.exportedElements.length
    ?? elements.filter((element) => element.status === "exported").length;
  const hasSource = source !== null;
  const hasDetections = detectionCount > 0;
  const isDetectionComplete = hasDetections && pendingReviewCount === 0;
  const isSegmentComplete = isDetectionComplete && (segmentableCount === 0 || pendingMaskCount === 0);
  const isRepairStageComplete = isSegmentComplete && (repairNeededCount === 0 || repairCompleteCount >= repairNeededCount);
  const segmentDetail = !hasDetections
    ? "Await detections"
    : pendingReviewCount > 0
      ? "Await accepted assets"
    : segmentableCount === 0
      ? "No segment masks needed"
      : pendingMaskCount > 0
        ? `${pendingMaskCount} accepted asset${pendingMaskCount === 1 ? " needs" : "s need"} masks`
        : `${maskReadyCount} mask${maskReadyCount === 1 ? "" : "s"} ready`;
  const repairDetail = !isSegmentComplete
    ? "Await masks"
    : repairNeededCount === 0
      ? "No repair gaps"
      : repairCompleteCount >= repairNeededCount
        ? `${repairCompleteCount} repair${repairCompleteCount === 1 ? "" : "s"} complete`
        : `${repairNeededCount - repairCompleteCount} repair${repairNeededCount - repairCompleteCount === 1 ? "" : "s"} pending`;

  return applySingleActiveState([
    {
      name: "Upload",
      detail: source ? source.filename : "Awaiting source",
      isComplete: hasSource,
    },
    {
      name: "Detect",
      detail: detectionCount > 0
        ? `${detectionCount} candidate${detectionCount === 1 ? "" : "s"}`
        : hasSource
          ? "Ready for model detection"
          : "Needs source",
      isComplete: isDetectionComplete,
    },
    {
      name: "Segment",
      detail: segmentDetail,
      isComplete: isSegmentComplete,
    },
    {
      name: "Repair",
      detail: repairDetail,
      isComplete: isRepairStageComplete,
    },
    {
      name: "Export",
      detail: exportedCount > 0
        ? `${exportedCount} exported`
        : exportSummary
          ? `${exportSummary.blockedCount} blocked`
          : "Export assets",
      isComplete: exportedCount > 0,
    },
  ]);
}

function applySingleActiveState(stages: PipelineStageDraft[]): PipelineStage[] {
  const firstIncompleteIndex = stages.findIndex((stage) => !stage.isComplete);
  const activeIndex = firstIncompleteIndex === -1 ? stages.length - 1 : firstIncompleteIndex;

  // active 只允许由有序阶段一次性推导，避免每个阶段独立判断时出现多个 is-active。
  return stages.map((stage, index) => ({
    name: stage.name,
    detail: stage.detail,
    state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
}

function isActivePipelineElement(element: WorkspaceElement): boolean {
  return element.mergedInto === null && element.mode !== "rejected" && element.status !== "rejected";
}

function needsDetectionReview(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element)) {
    return false;
  }
  // WHY: 未审核候选还没有角色/分割路径结论，不能被 segmentableCount === 0 误解释为“无需分割”。
  return ["model_detected", "click_detected", "proposal", "edited", "child", "merged"].includes(element.status);
}

function isSegmentableElement(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element) || !isSegmentPipelineRole(element)) {
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
  // WHY: SAM2 suggest 与 bbox_alpha 都会产生 mask 文件，但只有 accept 后端状态才代表主路径贴纸可进入修复/导出。
  return isSegmentableElement(element) && element.segmentationStatus === "mask_accepted";
}

function needsRepair(element: WorkspaceElement): boolean {
  if (!isActivePipelineElement(element) || !isSegmentPipelineRole(element)) {
    return false;
  }
  return element.mode === "needs_completion"
    || ["repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}

function isRepairComplete(element: WorkspaceElement): boolean {
  if (!needsRepair(element)) {
    return false;
  }
  return element.status === "repair_complete" || element.mode === "completed_by_codex";
}

function isSegmentPipelineRole(element: WorkspaceElement): boolean {
  return ["sticker", "removable_child", "parent"].includes(element.assetRole);
}
