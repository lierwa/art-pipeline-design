import { useMemo } from "react";

import {
  isElementDraftDirty,
  isGeometryDraftDirty,
  parseBox,
  unionBoxes,
} from "../domain/elementDraft";
import type {
  ElementEditorDraft,
  ExportSummary,
  OverlayState,
  RepairMetadata,
  RepairQaReport,
  SelectedElementIds,
  WorkspaceElement,
  WorkspaceState,
} from "../domain/workspace";
import {
  buildPersistedBackStep,
  canBatchExtractElement,
  canExtractElement,
  hasExtractedAssetPreview,
  hasRepairPackage,
  isActionableElement,
  isActiveCandidate,
  isDisplayableElement,
  isExportReadyElement,
  isMergeableElement,
  isPendingSegmentMaskElement,
  isPendingCodexFinalElement,
  isRejectedElement,
  isSegmentableWorkbenchElement,
  isSuggestedMaskElement,
  needsElementReview,
} from "../domain/workspaceDerived";

type UseAppDerivedStateInput = {
  assetContextMenuElementId: string | null;
  elementDraft: ElementEditorDraft | null;
  exportSummary: ExportSummary | null;
  isRepairing: boolean;
  mergeDraftElementIds: string[] | null;
  overlays: OverlayState;
  repairMetadataByElementId: Record<string, RepairMetadata>;
  repairQaReport: RepairQaReport | null;
  savedMissingMaskElementIds: string[];
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  workspace: WorkspaceState;
};

export function useAppDerivedState({
  assetContextMenuElementId,
  elementDraft,
  exportSummary,
  isRepairing,
  mergeDraftElementIds,
  overlays,
  repairMetadataByElementId,
  repairQaReport,
  savedMissingMaskElementIds,
  selectedElementId,
  selectedElementIds,
  workspace,
}: UseAppDerivedStateInput) {
  const sourceDetails = useMemo(() => {
    if (!workspace.source) {
      return "No source loaded";
    }
    return `${workspace.source.filename} - ${workspace.source.width} x ${workspace.source.height}`;
  }, [workspace.source]);

  const visibleElements = useMemo(() => {
    return workspace.elements.filter((element) => {
      if (!isDisplayableElement(element)) {
        return false;
      }
      if (isRejectedElement(element) && !overlays.showRejected) {
        return false;
      }
      return true;
    });
  }, [overlays.showRejected, workspace.elements]);

  const hasRejectedElements = useMemo(
    () => workspace.elements.some(isRejectedElement),
    [workspace.elements],
  );

  const mergeableElements = useMemo(() => {
    return workspace.elements.filter(isMergeableElement);
  }, [workspace.elements]);

  const activeCandidateCount = useMemo(() => {
    return workspace.elements.filter(isActiveCandidate).length;
  }, [workspace.elements]);

  const activeReviewCount = useMemo(() => {
    return workspace.elements.filter(needsElementReview).length;
  }, [workspace.elements]);

  const persistedBackStep = useMemo(
    () => buildPersistedBackStep(workspace, selectedElementId),
    [selectedElementId, workspace],
  );

  const overlayElements = useMemo(() => {
    return visibleElements.filter(
      (element) => element.visible || (overlays.showRejected && isRejectedElement(element)),
    );
  }, [overlays.showRejected, visibleElements]);

  const selectedReviewElement = useMemo(() => {
    return visibleElements.find(
      (element) => element.id === selectedElementId && isDisplayableElement(element),
    ) ?? null;
  }, [selectedElementId, visibleElements]);

  const selectedElement = useMemo(() => {
    return selectedReviewElement && isActionableElement(selectedReviewElement)
      ? selectedReviewElement
      : null;
  }, [selectedReviewElement]);

  const selectedSegmentElement = useMemo(() => {
    return selectedElement && isSegmentableWorkbenchElement(selectedElement)
      ? selectedElement
      : null;
  }, [selectedElement]);

  const canvasOverlayElements = useMemo(() => {
    if (!selectedElement || !elementDraft) {
      return overlayElements;
    }

    const draftBbox = parseBox(elementDraft.bbox);
    if (!draftBbox) {
      return overlayElements;
    }

    return overlayElements.map((element) =>
      element.id === selectedElement.id
        ? { ...element, bbox: draftBbox }
        : element,
    );
  }, [elementDraft, overlayElements, selectedElement]);

  const canExtractSelected = useMemo(() => {
    return selectedElement !== null && canExtractElement(selectedElement);
  }, [selectedElement]);

  const hasUnsavedGeometryChanges = useMemo(() => {
    return selectedElement !== null && elementDraft !== null
      ? isGeometryDraftDirty(selectedElement, elementDraft)
      : false;
  }, [elementDraft, selectedElement]);

  const hasUnsavedElementChanges = useMemo(() => {
    return selectedElement !== null && elementDraft !== null
      ? isElementDraftDirty(selectedElement, elementDraft)
      : false;
  }, [elementDraft, selectedElement]);

  const selectedMergeableElements = useMemo(() => {
    return selectedElementIds
      .map((elementId) => mergeableElements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
  }, [mergeableElements, selectedElementIds]);

  const selectedMergeableElementCount = selectedMergeableElements.length;
  const canMergeSelectedElements = !hasUnsavedGeometryChanges && selectedMergeableElementCount >= 2;

  const mergePreview = useMemo(() => {
    if (!canMergeSelectedElements) {
      return null;
    }

    return unionBoxes(selectedMergeableElements.map((element) => element.bbox));
  }, [canMergeSelectedElements, selectedMergeableElements]);

  const canRunSelectedExtraction = canExtractSelected && !hasUnsavedGeometryChanges;
  const contextMenuElement = assetContextMenuElementId
    ? visibleElements.find((element) => element.id === assetContextMenuElementId) ?? null
    : null;
  const contextMenuMergeElements = contextMenuElement ? selectedMergeableElements : [];
  const isContextMenuElementSelectedForMerge = contextMenuElement
    ? selectedElementIds.includes(contextMenuElement.id)
    : false;
  const canContextMenuElementJoinMerge = contextMenuElement
    ? isMergeableElement(contextMenuElement)
    : false;
  const canContextMenuMergeWithSelection = Boolean(
    contextMenuElement
      && canContextMenuElementJoinMerge
      && !isContextMenuElementSelectedForMerge
      && selectedMergeableElementCount >= 1
      && !hasUnsavedGeometryChanges,
  );

  const mergeDraftElements = useMemo(() => {
    if (!mergeDraftElementIds) {
      return [];
    }
    return mergeDraftElementIds
      .map((elementId) => workspace.elements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
  }, [mergeDraftElementIds, workspace.elements]);

  const selectedRepairMetadata = selectedElement
    ? repairMetadataByElementId[selectedElement.id] ?? null
    : null;
  const selectedRepairQaReport =
    repairQaReport?.elementId === selectedElement?.id
      ? repairQaReport
      : selectedRepairMetadata?.qaReport ?? null;
  const selectedHasMissingMask = selectedElement
    ? selectedRepairMetadata
      ? selectedRepairMetadata.files.missingMask
      : savedMissingMaskElementIds.includes(selectedElement.id)
    : false;
  const selectedHasRepairPackage = selectedElement
    ? selectedRepairMetadata
      ? selectedRepairMetadata.files.repairPackage
      : hasRepairPackage(selectedElement)
    : false;
  const canDrawMissingMask =
    selectedElement !== null
    && selectedElement.mode === "needs_completion"
    && !hasUnsavedGeometryChanges
    && !isRepairing;

  const batchExtractElementIds = useMemo(() => {
    return workspace.elements
      .filter((element) => isActionableElement(element) && canBatchExtractElement(element))
      .map((element) => element.id);
  }, [workspace.elements]);

  const batchSegmentElementIds = useMemo(() => {
    return workspace.elements
      .filter(isPendingSegmentMaskElement)
      .map((element) => element.id);
  }, [workspace.elements]);

  const reviewSegmentElementIds = useMemo(() => {
    return workspace.elements
      .filter(isSuggestedMaskElement)
      .map((element) => element.id);
  }, [workspace.elements]);

  const batchCodexFinalElementIds = useMemo(() => {
    return workspace.elements
      .filter(isPendingCodexFinalElement)
      .map((element) => element.id);
  }, [workspace.elements]);

  const canExportAssetPack = useMemo(() => {
    return workspace.source !== null && workspace.elements.some(isExportReadyElement);
  }, [workspace.elements, workspace.source]);

  const shouldShowWorkspacePreviews =
    Boolean(selectedElement && (selectedElement.mask || hasExtractedAssetPreview(selectedElement)))
    || Boolean(selectedRepairMetadata)
    || Boolean(selectedRepairQaReport)
    || Boolean(selectedHasMissingMask)
    || exportSummary !== null;

  // WHY: App 只消费这些稳定投影，不再在主组件里重复推导“当前选择/右侧菜单/批量动作”。
  // 这让事件处理保持在 App，派生 UI 状态则集中在一个可测试、可继续拆分的边界里。
  return {
    activeReviewCount,
    batchExtractElementIds,
    batchCodexFinalElementIds,
    batchSegmentElementIds,
    canContextMenuElementJoinMerge,
    canContextMenuMergeWithSelection,
    canDrawMissingMask,
    canExportAssetPack,
    canMergeSelectedElements,
    canResetDetectionStage: workspace.source !== null && activeReviewCount > 0,
    canRunDetection: workspace.source !== null && activeCandidateCount === 0,
    canRunSelectedExtraction,
    canvasOverlayElements,
    contextMenuElement,
    contextMenuMergeElements,
    hasBatchExtractTargets: batchExtractElementIds.length > 0,
    hasBatchCodexFinalTargets:
      batchCodexFinalElementIds.length > 0
      && batchSegmentElementIds.length === 0
      && reviewSegmentElementIds.length === 0,
    hasBatchSegmentTargets: batchSegmentElementIds.length > 0,
    hasRejectedElements,
    hasUnsavedElementChanges,
    hasUnsavedGeometryChanges,
    isContextMenuElementSelectedForMerge,
    mergeDraftElements,
    mergePreview,
    persistedBackStep,
    reviewableElementCount: activeReviewCount,
    selectedElement,
    selectedHasMissingMask,
    selectedHasRepairPackage,
    selectedRepairMetadata,
    selectedRepairQaReport,
    selectedSegmentElement,
    shouldShowWorkspacePreviews,
    sourceDetails,
    visibleElements,
  };
}
