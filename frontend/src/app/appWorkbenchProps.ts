import type { AppWorkflowState } from "./appWorkflowActions";
import type { AppWorkbenchProps } from "./components/AppWorkbench";
import {
  buildSourceUrl,
  type ElementEditorDraft,
} from "../domain/workspace";
import type { useAppDerivedState } from "./useAppDerivedState";
import type { AppShellState } from "./useAppShellState";
import type { useBoxEditController } from "../features/canvas/useBoxEditController";
import type { useCanvasInteractionController } from "../features/canvas/useCanvasInteractionController";
import type { useDetectionController } from "../features/detection/useDetectionController";
import type { useElementCreationController } from "../features/elements/useElementCreationController";
import type { useElementController } from "../features/elements/useElementController";
import type { useExtractionController } from "../features/extraction/useExtractionController";
import type { useMergeController } from "../features/elements/useMergeController";
import type { useRepairController } from "../features/repair/useRepairController";
import type { useSegmentController } from "../features/segment/useSegmentController";
import type { useSplitController } from "../features/elements/useSplitController";
import type { useUndoRedoController } from "./useUndoRedoController";
import type { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import type { useWorkspaceRunController } from "./useWorkspaceRunController";
import type { useWorkspaceTaskController } from "./useWorkspaceTaskController";
import type { useWorkflowController } from "./useWorkflowController";
import { buildTaskItemIndex } from "../domain/workspaceTasks";

type AppDerivedState = ReturnType<typeof useAppDerivedState>;
type BoxEditController = ReturnType<typeof useBoxEditController>;
type CanvasInteractionController = ReturnType<typeof useCanvasInteractionController>;
type DetectionController = ReturnType<typeof useDetectionController>;
type ElementCreationController = ReturnType<typeof useElementCreationController>;
type ElementController = ReturnType<typeof useElementController>;
type ExtractionController = ReturnType<typeof useExtractionController>;
type MergeController = ReturnType<typeof useMergeController>;
type RepairController = ReturnType<typeof useRepairController>;
type SegmentController = ReturnType<typeof useSegmentController>;
type SplitController = ReturnType<typeof useSplitController>;
type UndoRedoController = ReturnType<typeof useUndoRedoController>;
type WorkspaceFileActions = ReturnType<typeof useWorkspaceFileActions>;
type WorkspaceRunController = ReturnType<typeof useWorkspaceRunController>;
type WorkspaceTaskController = ReturnType<typeof useWorkspaceTaskController>;
type WorkflowController = ReturnType<typeof useWorkflowController>;

type AppWorkbenchPropsInput = {
  boxEdit: BoxEditController;
  canvasInteraction: CanvasInteractionController;
  derived: AppDerivedState;
  detection: DetectionController;
  element: ElementController;
  elementCreation: ElementCreationController;
  extraction: ExtractionController;
  fileActions: WorkspaceFileActions;
  inspectorDraft: ElementEditorDraft | null;
  merge: MergeController;
  repair: RepairController;
  runController: WorkspaceRunController;
  segment: SegmentController;
  shell: AppShellState;
  split: SplitController;
  undoRedo: UndoRedoController;
  workflow: AppWorkflowState;
  workflowController: WorkflowController;
  workspaceTasks: WorkspaceTaskController;
};

export function buildAppWorkbenchProps({
  boxEdit,
  canvasInteraction,
  derived,
  detection,
  element,
  elementCreation,
  extraction,
  fileActions,
  inspectorDraft,
  merge,
  repair,
  runController,
  segment,
  shell,
  split,
  undoRedo,
  workflow,
  workflowController,
  workspaceTasks,
}: AppWorkbenchPropsInput): AppWorkbenchProps {
  const workspaceHasSource = Boolean(shell.workspace.source);
  // WHY: 持久化 workspace 加载时 source metadata 会先于 lifecycle effect 写入 sourceUrl；
  // 这里同步投影 HTTP fallback，避免画布在两次 render 之间短暂退回空状态。
  const canvasSourceUrl = shell.sourceUrl
    ?? (shell.workspace.source ? buildSourceUrl(shell.assetCacheKey, shell.activeRunId) : null);
  const taskItemsByElementId = buildTaskItemIndex(workspaceTasks.tasks, shell.workspace.elements);
  const selectedElementAssetCacheKey = derived.selectedElement
    ? shell.assetCacheKey + (shell.elementAssetCacheKeys[derived.selectedElement.id] ?? 0)
    : shell.assetCacheKey;
  const selectedSegmentAssetCacheKey = derived.selectedSegmentElement
    ? shell.assetCacheKey + (shell.elementAssetCacheKeys[derived.selectedSegmentElement.id] ?? 0)
    : shell.assetCacheKey;

  return {
    topBar: {
      source: shell.workspace.source,
      status: shell.status,
      primaryActionLabel: workflow.primaryWorkflowAction.label,
      primaryActionHelp: workflow.primaryWorkflowAction.help,
      isPrimaryActionRunning: workflow.primaryWorkflowAction.isRunning,
      isPrimaryActionDisabled: workflow.primaryWorkflowAction.disabled,
      secondaryActionLabel: workflow.secondaryWorkflowAction?.label ?? null,
      secondaryActionHelp: workflow.secondaryWorkflowAction?.help ?? null,
      isSecondaryActionRunning: workflow.secondaryWorkflowAction?.isRunning ?? false,
      isSecondaryActionDisabled: workflow.secondaryWorkflowAction?.disabled ?? false,
      canStopCodexGeneration: workspaceTasks.hasActiveCodexFinalTask,
      isStoppingCodexGeneration: workspaceTasks.isStoppingCodexFinalTask,
      runs: shell.workspaceRuns,
      activeRunId: shell.activeRunId,
      onUpload: fileActions.handleUpload,
      onPrimaryAction: workflow.primaryWorkflowAction.onRun,
      onSecondaryAction: workflow.secondaryWorkflowAction?.onRun,
      onStopCodexGeneration: () => void workspaceTasks.handleStopCodexFinalTasks(),
      onSelectRun: (runId) => void runController.handleSelectRun(runId),
      onDuplicateRun: (runId) => void runController.handleDuplicateRun(runId),
      onDeleteRun: (runId) => void runController.handleDeleteRun(runId),
    },
    rail: {
      source: shell.workspace.source,
      elements: shell.workspace.elements,
      exportSummary: shell.exportSummary,
      workflowStage: workflowController.effectiveWorkflow.stage,
      canGoBack:
        workflowController.canGoBackStage
        && !derived.hasUnsavedGeometryChanges
        && !derived.hasUnsavedElementChanges,
      onGoBack: () => void workflowController.handleStageBack(),
    },
    canvas: {
      acceptingSegmentElementId: segment.acceptingSegmentElementId,
      activeRunId: shell.activeRunId,
      assetCacheKey: shell.assetCacheKey,
      selectedElementAssetCacheKey,
      selectedSegmentAssetCacheKey,
      canDrawMissingMask: derived.canDrawMissingMask,
      canMergeSelectedElements: derived.canMergeSelectedElements,
      canRedo: undoRedo.canRedoApp,
      canUndo: undoRedo.canUndoApp,
      canvasFocusRequest: shell.canvasFocusRequest,
      canvasOverlayElements: derived.canvasOverlayElements,
      canvasPan: shell.viewport.canvasPan,
      canvasZoom: shell.viewport.canvasZoom,
      draftRegion: shell.draftRegion,
      editingElementId: boxEdit.editingElementId,
      exportSummary: shell.exportSummary,
      generateReview: {
        elements: shell.workspace.elements,
        generatePromptHints: workflowController.effectiveWorkflow.generatePromptHints,
        selectedElement: derived.selectedElement,
        taskItemsByElementId,
        onRerunElement: (elementId, promptHint) =>
          void workflowController.handleRerunGenerateElement(elementId, promptHint),
        onSavePromptHint: (elementId, promptHint) =>
          void workflowController.handleSaveGeneratePromptHint(elementId, promptHint),
      },
      hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
      isAnnotating: detection.isAnnotating,
      isCanvasPanMode: shell.viewport.isCanvasPanMode,
      isPromptBoardExpanded: shell.isPromptBoardExpanded,
      isSavingVocabulary: detection.isSavingVocabulary,
      manualElementName: shell.manualElementName,
      mergePreview: derived.mergePreview,
      missingMaskRegion: repair.missingMaskRegion,
      overlays: shell.overlays,
      renamingElementId: shell.renamingElementId,
      segmentEdgeBoardRef: shell.segmentEdgeBoardRef,
      selectedElement: derived.selectedElement,
      selectedElementId: shell.selectedElementId,
      selectedElementIds: shell.selectedElementIds,
      selectedHasMissingMask: derived.selectedHasMissingMask,
      selectedRepairMetadata: derived.selectedRepairMetadata,
      selectedRepairQaReport: derived.selectedRepairQaReport,
      selectedSegmentElement: derived.selectedSegmentElement,
      shouldShowWorkspacePreviews: derived.shouldShowWorkspacePreviews,
      sourceDetails: derived.sourceDetails,
      sourceUrl: canvasSourceUrl,
      splitRegions: shell.splitRegions,
      suggestingSegmentElementId: segment.suggestingSegmentElementId,
      pendingTask: workspaceTasks.pendingTask,
      tasks: workspaceTasks.tasks,
      tool: shell.viewport.tool,
      workflowStage: workflowController.effectiveWorkflow.stage,
      workspace: shell.workspace,
      onAcceptSegmentMask: (elementId) => void segment.handleAcceptSegmentMask(elementId),
      onAddSplitRegion: (region) => shell.setSplitRegions((current) => [...current, region]),
      onApplySplit: () => void split.handleApplySplit(),
      onBoxDraftChange: boxEdit.handleBoxDraftChange,
      onCancelBoxEdit: boxEdit.handleCancelBoxEdit,
      onCancelInlineRenameElement: element.handleCancelInlineRenameElement,
      onClearDrafts: canvasInteraction.clearDrafts,
      onClearSelection: canvasInteraction.handleClearSelection,
      onClickDetectPoint: (point) => void detection.handleClickDetectPoint(point),
      onCommitRenameElement: (elementId, name) => void element.handleCommitInlineRenameElement(elementId, name),
      onCompleteMissingMaskRegion: (region) => void repair.handleCompleteMissingMaskRegion(
        derived.selectedElement,
        derived.canDrawMissingMask,
        region,
      ),
      onCreateChildElement: (name) => void elementCreation.handleCreateChildElement(name),
      onCreateElement: (name) => void elementCreation.handleCreateElement(name),
      onDraftRegionChange: shell.setDraftRegion,
      onEditBox: boxEdit.handleStartBoxEdit,
      onFitCanvas: shell.viewport.fitCanvas,
      onManualElementNameChange: shell.setManualElementName,
      onMergeSelectedElements: () => void merge.handleMergeSelectedElements(derived.hasUnsavedGeometryChanges),
      onMissingMaskRegionChange: repair.setMissingMaskRegion,
      onOpenElementContextMenu: canvasInteraction.handleOpenElementContextMenu,
      onOverlayToggle: canvasInteraction.handleOverlayToggle,
      onPanChange: shell.viewport.panCanvas,
      onPatchSegmentMask: segment.handlePatchSegmentMask,
      onPromptBoardExpandedChange: shell.setIsPromptBoardExpanded,
      onRedo: () => void undoRedo.handleRedo(),
      onRetryFailedTask: (taskId) => void workspaceTasks.handleRetryFailedTask(taskId),
      onRerunSegmentMasks: (elementIds) => void segment.handleRerunSegmentMasks(elementIds),
      onSaveDetectionVocabulary: (labels) => void detection.handleSaveDetectionVocabulary(labels),
      onSaveElement: () => void element.handleSaveElement(),
      onSelectElement: canvasInteraction.handleSelectElement,
      onSelectTool: canvasInteraction.handleSelectTool,
      onSegmentDraftHistoryChange: shell.setSegmentDraftHistoryStatus,
      onStartInlineRenameElement: element.handleStartInlineRenameElement,
      onTogglePanMode: canvasInteraction.handleTogglePanMode,
      onUndo: () => void undoRedo.handleUndo(),
      onZoomByGesture: (scaleDelta) => shell.viewport.zoomByGesture(workspaceHasSource, scaleDelta),
      onZoomByWheel: (deltaY) => shell.viewport.zoomByWheel(workspaceHasSource, deltaY),
      onZoomIn: shell.viewport.zoomIn,
      onZoomOut: shell.viewport.zoomOut,
    },
    review: {
      activeRunId: shell.activeRunId,
      assetCacheKey: shell.assetCacheKey,
      canRunSelectedExtraction: derived.canRunSelectedExtraction,
      hasRejectedElements: derived.hasRejectedElements,
      hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
      inspectorDraft,
      isExtracting: extraction.isExtracting,
      isRepairing: repair.isRepairing,
      missingMaskDraft: repair.missingMaskDraft,
      overlays: shell.overlays,
      reviewableElementCount: derived.reviewableElementCount,
      selectedElement: derived.selectedElement,
      selectedElementId: shell.selectedElementId,
      selectedElementIds: shell.selectedElementIds,
      selectedHasMissingMask: derived.selectedHasMissingMask,
      selectedHasRepairPackage: derived.selectedHasRepairPackage,
      selectedRepairQaReport: derived.selectedRepairQaReport,
      splitRequestDescription: shell.splitRequestDescription,
      taskItemsByElementId,
      visibleElements: derived.visibleElements,
      workflowStage: workflowController.effectiveWorkflow.stage,
      workspaceElements: shell.workspace.elements,
      onClearMask: () => void extraction.handleClearMask(
        derived.selectedElement,
        derived.hasUnsavedGeometryChanges,
      ),
      onCompleteReview: () => void element.handleCompleteReview(),
      onCreateRepairTask: () => void repair.handleCreateRepairTask(
        derived.selectedElement,
        derived.hasUnsavedGeometryChanges,
      ),
      onCreateSplitRequest: () => void split.handleCreateSplitRequest(),
      onDrawMissingMask: () => repair.handleStartMissingMaskDrawing(derived.canDrawMissingMask),
      onDraftChange: shell.setElementDraft,
      onMissingMaskDraftChange: repair.setMissingMaskDraft,
      onMoveElementToParent: (elementId, parentId) => void element.handleMoveElementToParent(elementId, parentId),
      onPatchElementRole: (elementId, patch) => void element.handlePatchElementRole(elementId, patch),
      onRejectElement: (elementId) => void element.handleReject(elementId),
      onReExtract: () => void extraction.handleExtractSelected(
        derived.selectedElement,
        derived.canRunSelectedExtraction,
      ),
      onReorderElement: (elementId, targetElementId, position) => void element.handleReorderElement(
        elementId,
        targetElementId,
        position,
      ),
      generateSelection: workflowController.effectiveWorkflow.generateSelection,
      onToggleAllGenerateSelection: (elementIds, isSelected) =>
        void workflowController.handleToggleAllGenerateSelection(elementIds, isSelected),
      onToggleGenerateSelection: (elementId, isSelected) =>
        void workflowController.handleToggleGenerateSelection(elementId, isSelected),
      onReplaceMaskByCurrentShape: () => void extraction.handleReplaceMaskByCurrentShape(
        derived.selectedElement,
        derived.canRunSelectedExtraction,
      ),
      onSaveElement: () => void element.handleSaveElement(),
      onSaveMissingMaskFromDraft: () => void repair.handleSaveMissingMaskFromDraft(
        derived.selectedElement,
        derived.hasUnsavedGeometryChanges,
      ),
      onSelectElement: canvasInteraction.handleSelectElement,
      onSplitRequestDescriptionChange: shell.setSplitRequestDescription,
      onToggleShowRejected: () => canvasInteraction.handleOverlayToggle("showRejected"),
      onToggleVisibility: (elementId) => void element.handleVisibilityToggle(elementId),
      onValidateRepairOutput: () => void repair.handleValidateRepairOutput(derived.selectedElement),
    },
    chrome: {
      assetContextMenu: shell.assetContextMenu,
      canContextMenuElementJoinMerge: derived.canContextMenuElementJoinMerge,
      canContextMenuMergeWithSelection: derived.canContextMenuMergeWithSelection,
      canMergeSelectedElements: derived.canMergeSelectedElements,
      contextMenuElement: derived.contextMenuElement,
      contextMenuMergeElements: derived.contextMenuMergeElements,
      exportSummary: shell.exportSummary,
      hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
      isContextMenuElementSelectedForMerge: derived.isContextMenuElementSelectedForMerge,
      isSavingState: shell.isSavingState,
      mergeDraft: merge.mergeDraft,
      mergeDraftElements: derived.mergeDraftElements,
      status: shell.status,
      workflowToast: workflow.workflowToast,
      workspaceElements: shell.workspace.elements,
      onAcceptElement: (elementId) => void element.handleAccept(elementId),
      onAddChildFromSelection: () => void elementCreation.handleAddChildFromSelection(),
      onCancelMergeDraft: merge.cancelMergeDraft,
      onCloseAssetContextMenu: canvasInteraction.closeAssetContextMenu,
      onConfirmMergeDraft: () => void merge.confirmMergeDraft(derived.hasUnsavedGeometryChanges),
      onEditBox: boxEdit.handleStartBoxEdit,
      onMergeDraftLabelChange: merge.handleMergeDraftLabelChange,
      onMergeSelectedElements: () => void merge.handleMergeSelectedElements(derived.hasUnsavedGeometryChanges),
      onMergeSelectionToggle: canvasInteraction.handleMergeSelectionToggle,
      onMergeWithSelection: (elementId) => void merge.handleMergeWithSelection(
        elementId,
        derived.hasUnsavedGeometryChanges,
      ),
      onRejectElement: (elementId) => void element.handleReject(elementId),
      onRenameElement: (elementId) => void element.handleRenameElement(elementId),
      onSplitParent: split.handleStartSplitParent,
      onWorkflowToastDismiss: () => shell.setError(null),
    },
  };
}
