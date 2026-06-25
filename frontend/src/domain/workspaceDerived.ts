import { ElementStatus, isCodexFinalSourceProvider, updateElement, WorkspaceElement, WorkspaceState } from "./workspace";

export const DEFAULT_MERGE_LABEL = "Merged Asset";

export type WorkspaceReorderPosition = "before" | "after";

const SEGMENT_WORKBENCH_STATUSES: ElementStatus[] = [
  "accepted",
  "extract_ready",
  "extracted",
  "repair_pending",
  "repair_complete",
];

const SAM2_MASK_BATCH_STATUSES: ElementStatus[] = [
  "accepted",
  "extract_ready",
  "extracted",
  "repair_pending",
  "repair_complete",
];

export type PersistedBackStep = {
  state: WorkspaceState;
  status: string;
  selectionId: string | null;
  promptBoardExpanded?: boolean;
};

export function canExtractElement(element: WorkspaceElement): boolean {
  if (isRejectedElement(element)) {
    return false;
  }

  // WHY: 当前主链路是 Detect -> SAM2 mask -> Codex final；accepted 只代表检测框通过，
  // 不能再把它当成 bbox_alpha 的 legacy 提取入口，否则顶栏会在遮罩前错误显示 Extract All。
  return (
    element.segmentationStatus === "mask_accepted"
    && ["accepted", "extract_ready", "extracted"].includes(element.status)
  );
}

export function canBatchExtractElement(element: WorkspaceElement): boolean {
  if (isRejectedElement(element)) {
    return false;
  }

  return (
    element.segmentationStatus === "mask_accepted"
    && ["accepted", "extract_ready"].includes(element.status)
  );
}

export function isSegmentableWorkbenchElement(element: WorkspaceElement): boolean {
  if (!isActionableElement(element)) {
    return false;
  }

  if (isCodexFinalSourceProvider(element.sourceProvider)) {
    // WHY: Codex final 已经越过传统 accepted/extract_ready 状态，仍需要复用分割抽屉展示参考图与正式重绘结果。
    return ["repair_complete", "qa_failed"].includes(element.status);
  }

  // WHY: 用户在 Detect 阶段手工拆分/合并后的框，一旦 accepted 就是后续 SAM2/Codex 流程的一等资产；
  // 不能按 source=manual 拦掉，否则历史 run 中已有 mask 的 tower、towel+basket 会点不开审核面板。
  if (isManualSourceElement(element) && !hasReviewableSegmentMask(element)) {
    // WHY: 父级 mask 可能被错误 child mask 依赖卡住；允许 accepted parent 无 SAM2 artifact 时
    // 直接进入手修，给人工 override 一条比自动父子扣除更高优先级的路径。
    return element.assetRole === "parent" && element.visible && SEGMENT_WORKBENCH_STATUSES.includes(element.status);
  }
  return SEGMENT_WORKBENCH_STATUSES.includes(element.status);
}

export function buildClickDetectLabel(
  selectedElement: WorkspaceElement | null,
  vocabulary: string[],
): string {
  const selectedLabel = selectedElement
    ? (selectedElement.label ?? selectedElement.name).trim()
    : "";
  if (selectedLabel) {
    return selectedLabel;
  }

  // WHY: click-detect 后端要求 label；优先复用当前词表，避免 UI 在没有选择时发散出另一套临时类别协议。
  return vocabulary.find((label) => label.trim().length > 0)?.trim() ?? "Sticker";
}

export function isDisplayableElement(element: WorkspaceElement): boolean {
  return element.mergedInto === null;
}

export function isActionableElement(element: WorkspaceElement): boolean {
  return isDisplayableElement(element) && !isRejectedElement(element);
}

export function isMergeableElement(element: WorkspaceElement): boolean {
  return isActionableElement(element) && element.visible;
}

export function isActiveCandidate(element: WorkspaceElement): boolean {
  return isActionableElement(element);
}

export function needsElementReview(element: WorkspaceElement): boolean {
  return isActionableElement(element) && [
    "model_detected",
    "click_detected",
    "proposal",
    "edited",
    "child",
    "merged",
    "qa_failed",
  ].includes(element.status);
}

export function shouldCollapsePromptBoardForWorkspace(state: WorkspaceState): boolean {
  // WHY: 已检测的持久化 workspace 重新打开时也应回到 review 视角；
  // 只在加载边界推导一次，避免用户手动展开 prompt 后保存词表又被自动折叠。
  return state.source !== null && state.elements.some(needsElementReview);
}

export function reorderWorkspaceElementNearTarget(
  state: WorkspaceState,
  elementId: string,
  targetElementId: string,
  position: WorkspaceReorderPosition,
): WorkspaceState {
  if (elementId === targetElementId) {
    return state;
  }

  const element = state.elements.find((candidate) => candidate.id === elementId);
  const targetElement = state.elements.find((candidate) => candidate.id === targetElementId);
  if (!element || !targetElement || !isActionableElement(element) || !isActionableElement(targetElement)) {
    return state;
  }
  if (normalizeParentId(element.parentId) !== normalizeParentId(targetElement.parentId)) {
    return state;
  }

  const siblingIds = state.elements
    .filter((candidate) => (
      isActionableElement(candidate)
      && normalizeParentId(candidate.parentId) === normalizeParentId(element.parentId)
    ))
    .map((candidate) => candidate.id);
  const reorderedSiblingIds = reorderIdsNearTarget(
    siblingIds,
    elementId,
    targetElementId,
    position,
  );
  if (hasSameStringOrder(siblingIds, reorderedSiblingIds)) {
    return state;
  }

  const nextSiblingIds = [...reorderedSiblingIds];
  const elementById = new Map(state.elements.map((candidate) => [candidate.id, candidate]));
  // WHY: 只替换同父级可操作元素占据的位置，其他父子关系和不可见历史元素保持原位，避免排序拖拽隐式改语义。
  const elements = state.elements.map((candidate) => {
    if (!siblingIds.includes(candidate.id)) {
      return candidate;
    }
    return elementById.get(nextSiblingIds.shift() ?? candidate.id) ?? candidate;
  });

  return {
    ...state,
    elements,
  };
}

export function buildPersistedBackStep(
  state: WorkspaceState,
  selectedElementId: string | null,
): PersistedBackStep | null {
  if (!state.source) {
    return null;
  }

  const codexFinal = pickBackStepElement(
    state.elements,
    selectedElementId,
    isCodexFinalReadyElement,
  );
  if (codexFinal) {
    return {
      state: updateBackStepElement(state, codexFinal.id, (element) => ({
        ...element,
        repairStatus: "not_required",
        exportStatus: "not_ready",
      })),
      status: "Returned to final generation.",
      selectionId: codexFinal.id,
    };
  }

  const acceptedMask = pickBackStepElement(
    state.elements,
    selectedElementId,
    isAcceptedMaskElement,
  );
  if (acceptedMask) {
    return {
      state: updateBackStepElement(state, acceptedMask.id, (element) => ({
        ...element,
        segmentationStatus: "mask_suggested",
        repairStatus: "not_required",
        exportStatus: "not_ready",
      })),
      status: "Returned to mask review.",
      selectionId: acceptedMask.id,
    };
  }

  const suggestedMask = pickBackStepElement(
    state.elements,
    selectedElementId,
    isSuggestedMaskElement,
  );
  if (suggestedMask) {
    return {
      state: updateBackStepElement(state, suggestedMask.id, (element) => ({
        ...element,
        mask: null,
        segmentationStatus: "not_started",
        segmentationQuality: null,
        repairStatus: "not_required",
        exportStatus: "not_ready",
      })),
      status: "Returned to mask suggestion.",
      selectionId: suggestedMask.id,
    };
  }

  const reviewableAccepted = state.elements.filter(isAcceptedDetectionBackStepElement);
  if (reviewableAccepted.length > 0) {
    return {
      state: {
        ...state,
        elements: state.elements.map((element) =>
          isAcceptedDetectionBackStepElement(element)
            ? {
                ...element,
                status: "model_detected",
                mask: null,
                segmentationStatus: "not_started",
                segmentationQuality: null,
                repairStatus: "not_required",
                exportStatus: "not_ready",
              }
            : element,
        ),
      },
      status: "Returned to detection review.",
      selectionId: reviewableAccepted[0]?.id ?? null,
      promptBoardExpanded: false,
    };
  }

  return null;
}

export function isCodexFinalReadyElement(element: WorkspaceElement): boolean {
  return (
    isSegmentableWorkbenchElement(element)
    && isCodexFinalSourceProvider(element.sourceProvider)
    && element.exportStatus === "ready"
  );
}

export function isAcceptedMaskElement(element: WorkspaceElement): boolean {
  return (
    isSegmentableWorkbenchElement(element)
    && !isCodexFinalSourceProvider(element.sourceProvider)
    && element.segmentationStatus === "mask_accepted"
  );
}

export function isSuggestedMaskElement(element: WorkspaceElement): boolean {
  return (
    isSegmentableWorkbenchElement(element)
    && element.segmentationStatus === "mask_suggested"
  );
}

export function isPendingSegmentMaskElement(element: WorkspaceElement): boolean {
  if (!canRunSam2MaskBatch(element)) {
    return false;
  }

  // WHY: 批量入口只补齐还没有可审核遮罩的元素；已 suggest/accepted 的对象交给审核或生成步骤，避免一次批量操作覆盖人工确认过的 mask。
  return element.segmentationStatus === "not_started" || element.segmentationStatus === "mask_rejected";
}

export function isPendingCodexFinalElement(element: WorkspaceElement): boolean {
  if (!isGenerateSelectableElement(element)) {
    return false;
  }
  if (element.segmentationStatus !== "mask_accepted") {
    return false;
  }

  // WHY: 当前正式链路默认所有验收后的 mask 都要经过 Codex final 重绘；
  // SAM2/bbox_alpha 产物只能作为中间预览，不能被误判为最终可导出资产。
  return !(isCodexFinalSourceProvider(element.sourceProvider) && ["ready", "exported"].includes(element.exportStatus));
}

export function isGenerateSelectableElement(element: WorkspaceElement): boolean {
  if (!isActionableElement(element) || !element.visible) {
    return false;
  }
  if (element.assetRole === "skip") {
    return false;
  }
  return ["sticker", "removable_child", "parent"].includes(element.assetRole);
}

export function isAcceptedStatus(status: ElementStatus): boolean {
  return [
    "accepted",
    "exported",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
  ].includes(status);
}

export function canRejectStatus(status: ElementStatus): boolean {
  return ["proposal", "model_detected", "click_detected", "edited", "child", "merged"].includes(status);
}

export function buildDefaultMergeLabel(
  elements: WorkspaceElement[],
  existingElements: WorkspaceElement[] = [],
): string {
  const names = elements
    .map((element) => (element.label ?? element.name).trim())
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  let baseLabel = DEFAULT_MERGE_LABEL;
  if (uniqueNames.length === 0) {
    baseLabel = DEFAULT_MERGE_LABEL;
  } else if (uniqueNames.length === 1) {
    baseLabel = `${uniqueNames[0]} group`;
  } else if (uniqueNames.length === 2) {
    baseLabel = `${uniqueNames[0]} + ${uniqueNames[1]}`;
  } else {
    baseLabel = `${uniqueNames[0]} group`;
  }

  return buildUniqueElementName(baseLabel, existingElements);
}

export function buildUniqueElementName(baseLabel: string, existingElements: WorkspaceElement[]): string {
  const normalizedBaseLabel = baseLabel.trim() || DEFAULT_MERGE_LABEL;
  const existingNames = new Set(
    existingElements
      .filter(isDisplayableElement)
      .map((element) => (element.label ?? element.name).trim().toLowerCase())
      .filter(Boolean),
  );
  if (!existingNames.has(normalizedBaseLabel.toLowerCase())) {
    return normalizedBaseLabel;
  }

  let suffix = 2;
  while (existingNames.has(`${normalizedBaseLabel} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${normalizedBaseLabel} ${suffix}`;
}

export function isRejectedElement(element: WorkspaceElement): boolean {
  return element.mode === "rejected" || element.status === "rejected";
}

export function hasExtractedAssetPreview(element: WorkspaceElement): boolean {
  return ["extracted", "repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}

export function isExportReadyElement(element: WorkspaceElement): boolean {
  if (!isActionableElement(element)) {
    return false;
  }
  return (
    isCodexFinalSourceProvider(element.sourceProvider)
    && isRepairGateSatisfied(element)
    && isBackendExportGateSatisfied(element)
  );
}

export function hasRepairPackage(element: WorkspaceElement): boolean {
  return ["repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}

export function shouldLoadRepairMetadata(element: WorkspaceElement): boolean {
  return (
    element.mode === "needs_completion"
    || element.mode === "completed_by_codex"
    || hasRepairPackage(element)
  );
}

function reorderIdsNearTarget(
  ids: string[],
  elementId: string,
  targetElementId: string,
  position: WorkspaceReorderPosition,
): string[] {
  if (!ids.includes(elementId) || !ids.includes(targetElementId)) {
    return ids;
  }

  const withoutElement = ids.filter((id) => id !== elementId);
  const targetIndex = withoutElement.indexOf(targetElementId);
  if (targetIndex < 0) {
    return ids;
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutElement.slice(0, insertIndex),
    elementId,
    ...withoutElement.slice(insertIndex),
  ];
}

function hasSameStringOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeParentId(parentId: string | null | undefined): string | null {
  return parentId ?? null;
}

function pickBackStepElement(
  elements: WorkspaceElement[],
  selectedElementId: string | null,
  predicate: (element: WorkspaceElement) => boolean,
): WorkspaceElement | null {
  const selected = selectedElementId
    ? elements.find((element) => element.id === selectedElementId && predicate(element))
    : null;
  return selected ?? elements.find(predicate) ?? null;
}

function updateBackStepElement(
  state: WorkspaceState,
  elementId: string,
  updater: (element: WorkspaceElement) => WorkspaceElement,
): WorkspaceState {
  return {
    ...state,
    elements: updateElement(state.elements, elementId, updater),
  };
}

function isAcceptedDetectionBackStepElement(element: WorkspaceElement): boolean {
  // WHY: 重启后没有内存 undo 栈；这些字段是从“Use detected assets”进入 Segment 前的最小可逆状态。
  return (
    isActionableElement(element)
    && ["accepted", "extract_ready", "extracted"].includes(element.status)
    && element.segmentationStatus === "not_started"
    && element.sourceProvider !== "manual"
    && element.source !== "manual"
  );
}

function isManualSourceElement(element: WorkspaceElement): boolean {
  return element.sourceProvider === "manual" || element.source.startsWith("manual");
}

function hasReviewableSegmentMask(element: WorkspaceElement): boolean {
  return Boolean(element.mask) || ["mask_suggested", "mask_accepted", "mask_editing"].includes(element.segmentationStatus);
}

function canRunSam2MaskBatch(element: WorkspaceElement): boolean {
  // WHY: 批量 SAM2 的入口职责是“补齐还没有 mask 的可处理资产”，不能复用
  // Segment 面板打开条件；否则 accepted 的手工/合并框会因为还没有 mask 而永远无法进入批量生成。
  return (
    isActionableElement(element)
    && element.visible
    && element.assetRole !== "skip"
    && SAM2_MASK_BATCH_STATUSES.includes(element.status)
  );
}

function isRepairGateSatisfied(element: WorkspaceElement): boolean {
  if (element.repairStatus === "not_required") {
    return element.mode !== "needs_completion";
  }
  return element.repairStatus === "repair_complete";
}

function isBackendExportGateSatisfied(element: WorkspaceElement): boolean {
  return element.exportStatus === "ready" || element.exportStatus === "exported";
}
