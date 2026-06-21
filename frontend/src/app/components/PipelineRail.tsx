import { Undo2 } from "lucide-react";

import type { ExportSummary, SourceMetadata, WorkflowStage, WorkspaceElement } from "../../domain/workspace";

type PipelineRailProps = {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
  exportSummary: ExportSummary | null;
  workflowStage?: WorkflowStage;
  canGoBack: boolean;
  onGoBack: () => void;
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
  workflowStage,
  canGoBack,
  onGoBack,
}: PipelineRailProps) {
  const stages = buildStages(source, elements, exportSummary, workflowStage ?? inferWorkflowStage(source, elements));

  return (
    <nav className="pipeline-rail" aria-label="Pipeline stages">
      <button
        type="button"
        className="pipeline-back-button"
        disabled={!canGoBack}
        onClick={onGoBack}
      >
        <Undo2 size={15} strokeWidth={2.2} aria-hidden="true" />
        <span>Back Step</span>
      </button>
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
  workflowStage: WorkflowStage,
): PipelineStage[] {
  const activeElements = elements.filter(isActivePipelineElement);
  const detectionCount = activeElements.length;
  const maskReadyCount = activeElements.filter(hasSegmentationReady).length;
  const segmentableCount = elements.filter(isSegmentableElement).length;
  const pendingMaskCount = Math.max(segmentableCount - maskReadyCount, 0);
  const codexFinalCount = activeElements.filter(hasCodexFinalReady).length;
  const pendingCodexFinalCount = Math.max(segmentableCount - codexFinalCount, 0);
  const exportedCount =
    exportSummary?.exportedElements.length
    ?? elements.filter((element) => element.status === "exported").length;
  const hasSource = source !== null;
  const segmentDetail = detectionCount === 0
    ? "Await detections"
    : segmentableCount === 0
      ? "No segment masks needed"
      : pendingMaskCount > 0
        ? `${pendingMaskCount} asset${pendingMaskCount === 1 ? " needs" : "s need"} masks`
        : `${maskReadyCount} mask${maskReadyCount === 1 ? "" : "s"} ready`;
  const generateDetail = workflowStage === "upload" || workflowStage === "detect"
    ? "Await masks"
    : segmentableCount === 0
      ? "No final assets needed"
      : pendingCodexFinalCount > 0
        ? `${pendingCodexFinalCount} final${pendingCodexFinalCount === 1 ? "" : "s"} pending`
        : `${codexFinalCount} final${codexFinalCount === 1 ? "" : "s"} generated`;
  return applyWorkflowStageState(workflowStage, [
    {
      name: "Upload",
      detail: source ? source.filename : "Awaiting source",
    },
    {
      name: "Detect",
      detail: detectionCount > 0
        ? `${detectionCount} candidate${detectionCount === 1 ? "" : "s"}`
        : hasSource
          ? "Ready for model detection"
          : "Needs source",
    },
    {
      name: "Mask",
      detail: segmentDetail,
    },
    {
      name: "Generate",
      detail: exportedCount > 0
        ? `${codexFinalCount} final, ${exportedCount} exported`
        : generateDetail,
    },
  ]);
}

function applyWorkflowStageState(
  workflowStage: WorkflowStage,
  stages: Array<Omit<PipelineStage, "state">>,
): PipelineStage[] {
  const activeIndex = ["upload", "detect", "mask", "generate"].indexOf(workflowStage);

  // WHY: 左侧 rail 只呈现业务阶段；Repair/Export 是 generate 阶段内动作，
  // 不能再被资源状态推导成额外主阶段。
  return stages.map((stage, index) => ({
    name: stage.name,
    detail: stage.detail,
    state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
}

function inferWorkflowStage(source: SourceMetadata | null, elements: WorkspaceElement[]): WorkflowStage {
  if (!source) {
    return "upload";
  }
  if (elements.length === 0 || elements.some(needsDetectionReview)) {
    return "detect";
  }
  if (!elements.some(hasSegmentationReady)) {
    return "mask";
  }
  return "generate";
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

function hasCodexFinalReady(element: WorkspaceElement): boolean {
  return isSegmentableElement(element)
    && element.sourceProvider === "codex_cli"
    && ["ready", "exported"].includes(element.exportStatus);
}

function isSegmentPipelineRole(element: WorkspaceElement): boolean {
  return ["sticker", "removable_child", "parent"].includes(element.assetRole);
}
