import { AppWorkbench } from "./app/components/AppWorkbench";
import "./styles.css";
import { buildBoundAppWorkflowState } from "./app/appWorkflowBindings";
import { buildAppWorkbenchProps } from "./app/appWorkbenchProps";
import { useAppKeyboardShortcuts } from "./app/useAppKeyboardShortcuts";
import { useAppLifecycleEffects } from "./app/useAppLifecycleEffects";
import { useAppShellState } from "./app/useAppShellState";
import { useBoxEditController } from "./features/canvas/useBoxEditController";
import { useDetectionController } from "./features/detection/useDetectionController";
import { useAppDerivedState } from "./app/useAppDerivedState";
import { useCanvasInteractionController } from "./features/canvas/useCanvasInteractionController";
import { useElementCreationController } from "./features/elements/useElementCreationController";
import { useElementController } from "./features/elements/useElementController";
import { useExtractionController } from "./features/extraction/useExtractionController";
import { useMergeController } from "./features/elements/useMergeController";
import {
  useRepairController,
  useSelectedRepairMetadataLoader,
} from "./features/repair/useRepairController";
import { useSegmentController } from "./features/segment/useSegmentController";
import { useSplitController } from "./features/elements/useSplitController";
import { useUndoRedoController } from "./app/useUndoRedoController";
import { useWorkspaceFileActions } from "./app/useWorkspaceFileActions";
import { useWorkspaceHistoryController } from "./app/useWorkspaceHistoryController";
import { useWorkspaceRunController } from "./app/useWorkspaceRunController";
import { useWorkspaceTaskController } from "./app/useWorkspaceTaskController";
import { useWorkflowController } from "./app/useWorkflowController";
import { draftFromElement } from "./domain/elementDraft";
import {
  normalizeWorkspaceState,
  type WorkspaceRunsResponse,
  type WorkspaceState,
} from "./domain/workspace";
import { isActionableElement } from "./domain/workspaceDerived";

export function App() {
  const shell = useAppShellState();
  const history = useWorkspaceHistoryController({
    activeRunId: shell.activeRunId,
    refreshWorkspaceRuns,
    replaceWorkspace,
    selectedElementId: shell.selectedElementId,
    selectedElementIds: shell.selectedElementIds,
    setError: shell.setError,
    setIsSavingState: shell.setIsSavingState,
    setSelectedElementId: shell.setSelectedElementId,
    setSelectedElementIds: shell.setSelectedElementIds,
    setStatus: shell.setStatus,
    setWorkspace: shell.setWorkspace,
    workspace: shell.workspace,
  });
  const repair = useRepairController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    refreshWorkspaceRuns,
    setCanvasTool: shell.viewport.setCanvasTool,
    setDraftRegion: shell.setDraftRegion,
    setError: shell.setError,
    setSplitRegions: shell.setSplitRegions,
    setStatus: shell.setStatus,
  });
  const workspaceTasks = useWorkspaceTaskController({
    activeRunId: shell.activeRunId,
    setAssetCacheKey: shell.setAssetCacheKey,
    setError: shell.setError,
    setStatus: shell.setStatus,
    setWorkspace: shell.setWorkspace,
    workspaceHasSource: Boolean(shell.workspace.source),
  });
  const workflowController = useWorkflowController({
    activeRunId: shell.activeRunId,
    clearAllLocalRepairState: repair.clearAllLocalRepairState,
    hasActiveTask: workspaceTasks.hasActiveTask,
    replaceWorkspace,
    refreshTasks: workspaceTasks.refreshTasks,
    refreshWorkspaceRuns,
    setAssetCacheKey: shell.setAssetCacheKey,
    setError: shell.setError,
    setExportSummary: shell.setExportSummary,
    setIsPromptBoardExpanded: shell.setIsPromptBoardExpanded,
    setSelectedElementIds: shell.setSelectedElementIds,
    setStatus: shell.setStatus,
    startTask: workspaceTasks.handleTaskStarted,
    workspace: shell.workspace,
  });
  const segment = useSegmentController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    clearLocalRepairMetadata: repair.clearLocalRepairMetadata,
    pushUndoSnapshot: history.pushUndoSnapshot,
    refreshWorkspaceRuns,
    replaceWorkspace,
    setAssetCacheKey: shell.setAssetCacheKey,
    setError: shell.setError,
    setStatus: shell.setStatus,
    startCodexFinalTask: workspaceTasks.handleStartCodexFinalTask,
    startSam2MaskTask: workspaceTasks.handleStartSam2MaskTask,
    workspace: shell.workspace,
  });
  const extraction = useExtractionController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    clearLocalRepairMetadata: repair.clearLocalRepairMetadata,
    refreshWorkspaceRuns,
    setError: shell.setError,
    setStatus: shell.setStatus,
  });
  const merge = useMergeController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    refreshWorkspaceRuns,
    selectedElementIds: shell.selectedElementIds,
    setError: shell.setError,
    setStatus: shell.setStatus,
    workspace: shell.workspace,
  });
  const derived = useAppDerivedState({
    assetContextMenuElementId: shell.assetContextMenu?.elementId ?? null,
    elementDraft: shell.elementDraft,
    exportSummary: shell.exportSummary,
    isRepairing: repair.isRepairing,
    mergeDraftElementIds: merge.mergeDraft?.elementIds ?? null,
    overlays: shell.overlays,
    repairMetadataByElementId: repair.repairMetadataByElementId,
    repairQaReport: repair.repairQaReport,
    savedMissingMaskElementIds: repair.savedMissingMaskElementIds,
    selectedElementId: shell.selectedElementId,
    selectedElementIds: shell.selectedElementIds,
    workspace: shell.workspace,
  });
  const inspectorDraft =
    derived.selectedElement && shell.elementDraft === null
      ? draftFromElement(derived.selectedElement)
      : shell.elementDraft;

  useSelectedRepairMetadataLoader({
    activeRunId: shell.activeRunId,
    applyRepairMetadata: repair.applyRepairMetadata,
    forgetRepairMetadata: repair.forgetRepairMetadata,
    selectedElement: derived.selectedElement,
  });
  const detection = useDetectionController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    clearAllLocalRepairState: repair.clearAllLocalRepairState,
    refreshWorkspaceRuns,
    selectedElement: derived.selectedElement,
    selectedElementId: shell.selectedElementId,
    setCanvasTool: shell.viewport.setCanvasTool,
    setError: shell.setError,
    setIsPromptBoardExpanded: shell.setIsPromptBoardExpanded,
    setSelectedElementIds: shell.setSelectedElementIds,
    setStatus: shell.setStatus,
    workspace: shell.workspace,
  });
  const boxEdit = useBoxEditController({
    elementDraft: shell.elementDraft,
    selectedElement: derived.selectedElement,
    source: shell.workspace.source,
    onEnterSelectTool: () => shell.viewport.selectCanvasTool("select"),
    setElementDraft: shell.setElementDraft,
    setError: shell.setError,
    setStatus: shell.setStatus,
  });
  const canvasInteraction = useCanvasInteractionController({
    selectedElementIds: shell.selectedElementIds,
    selectCanvasTool: shell.viewport.selectCanvasTool,
    setAssetContextMenu: shell.setAssetContextMenu,
    setCanvasFocusRequest: shell.setCanvasFocusRequest,
    setDraftRegion: shell.setDraftRegion,
    setEditingElementId: boxEdit.setEditingElementId,
    setElementDraft: shell.setElementDraft,
    setMissingMaskRegion: repair.setMissingMaskRegion,
    setOverlays: shell.setOverlays,
    setRenamingElementId: shell.setRenamingElementId,
    setSelectedElementId: shell.setSelectedElementId,
    setSelectedElementIds: shell.setSelectedElementIds,
    setSplitRegions: shell.setSplitRegions,
    togglePanMode: shell.viewport.togglePanMode,
    visibleElements: derived.visibleElements,
    workspace: shell.workspace,
  });
  const element = useElementController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    clearBoxEditHistory: boxEdit.clearBoxEditHistory,
    clearLocalRepairMetadata: repair.clearLocalRepairMetadata,
    elementDraft: shell.elementDraft,
    handleSuggestAllSegmentMasks: segment.handleSuggestAllSegmentMasks,
    hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
    persistWorkspace: history.persistWorkspace,
    refreshWorkspaceRuns,
    selectedElement: derived.selectedElement,
    selectedElementId: shell.selectedElementId,
    selectedElementIds: shell.selectedElementIds,
    setEditingElementId: boxEdit.setEditingElementId,
    setElementDraft: shell.setElementDraft,
    setError: shell.setError,
    setIsSavingState: shell.setIsSavingState,
    setRenamingElementId: shell.setRenamingElementId,
    setSelectedElementId: shell.setSelectedElementId,
    setSelectedElementIds: shell.setSelectedElementIds,
    setStatus: shell.setStatus,
    workspace: shell.workspace,
  });
  const elementCreation = useElementCreationController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    clearBoxEditHistory: boxEdit.clearBoxEditHistory,
    draftRegion: shell.draftRegion,
    manualElementName: shell.manualElementName,
    refreshWorkspaceRuns,
    selectedElement: derived.selectedElement,
    setCanvasTool: shell.viewport.setCanvasTool,
    setDraftRegion: shell.setDraftRegion,
    setEditingElementId: boxEdit.setEditingElementId,
    setError: shell.setError,
    setManualElementName: shell.setManualElementName,
    setRenamingElementId: shell.setRenamingElementId,
    setStatus: shell.setStatus,
    workspace: shell.workspace,
  });
  const split = useSplitController({
    activeRunId: shell.activeRunId,
    applyWorkspaceMutation: history.applyWorkspaceMutation,
    handleSelectTool: canvasInteraction.handleSelectTool,
    refreshWorkspaceRuns,
    selectedElement: derived.selectedElement,
    setCanvasTool: shell.viewport.setCanvasTool,
    setError: shell.setError,
    setSplitRegions: shell.setSplitRegions,
    setStatus: shell.setStatus,
    splitRegions: shell.splitRegions,
    splitRequestDescription: shell.splitRequestDescription,
  });

  useAppLifecycleEffects({
    activeRunId: shell.activeRunId,
    assetContextMenu: shell.assetContextMenu,
    clearBoxEditHistory: boxEdit.clearBoxEditHistory,
    selectRepairElement: repair.selectRepairElement,
    selectedElement: derived.selectedElement,
    selectedElementId: shell.selectedElementId,
    selectedSegmentElement: derived.selectedSegmentElement,
    setAssetContextMenu: shell.setAssetContextMenu,
    setEditingElementId: boxEdit.setEditingElementId,
    setElementDraft: shell.setElementDraft,
    setSegmentDraftHistoryStatus: shell.setSegmentDraftHistoryStatus,
    setSelectedElementId: shell.setSelectedElementId,
    setSourceUrl: shell.setSourceUrl,
    setSplitRequestDescription: shell.setSplitRequestDescription,
    sourceUrl: shell.sourceUrl,
    visibleElements: derived.visibleElements,
    workspaceHasSource: Boolean(shell.workspace.source),
  });

  const fileActions = useWorkspaceFileActions({
    activeRunId: shell.activeRunId,
    canExportAssetPack: derived.canExportAssetPack,
    clearAllLocalRepairState: repair.clearAllLocalRepairState,
    clearWorkspaceHistory: history.clearWorkspaceHistory,
    isExporting: shell.isExporting,
    isSavingState: shell.isSavingState,
    persistWorkspace: history.persistWorkspace,
    refreshWorkspaceRuns,
    replaceWorkspace,
    resetCanvasViewport: shell.viewport.resetCanvasViewport,
    setActiveRunId: shell.setActiveRunId,
    setAssetCacheKey: shell.setAssetCacheKey,
    setDraftRegion: shell.setDraftRegion,
    setError: shell.setError,
    setExportSummary: shell.setExportSummary,
    setIsExporting: shell.setIsExporting,
    setIsPromptBoardExpanded: shell.setIsPromptBoardExpanded,
    setSelectedElementId: shell.setSelectedElementId,
    setSourceUrl: shell.setSourceUrl,
    setSplitRegions: shell.setSplitRegions,
    setStatus: shell.setStatus,
    setWorkspace: shell.setWorkspace,
    setWorkspaceRuns: shell.setWorkspaceRuns,
    sourceUrl: shell.sourceUrl,
    workspace: shell.workspace,
  });
  const runController = useWorkspaceRunController({
    activeRunId: shell.activeRunId,
    clearAllLocalRepairState: repair.clearAllLocalRepairState,
    clearWorkspaceHistory: history.clearWorkspaceHistory,
    replaceWorkspace,
    resetCanvasViewport: shell.viewport.resetCanvasViewport,
    setActiveRunId: shell.setActiveRunId,
    setDraftRegion: shell.setDraftRegion,
    setEditingElementId: boxEdit.setEditingElementId,
    setError: shell.setError,
    setExportSummary: shell.setExportSummary,
    setIsPromptBoardExpanded: shell.setIsPromptBoardExpanded,
    setMissingMaskRegion: repair.setMissingMaskRegion,
    setRenamingElementId: shell.setRenamingElementId,
    setSelectedElementId: shell.setSelectedElementId,
    setSelectedElementIds: shell.setSelectedElementIds,
    setSourceUrl: shell.setSourceUrl,
    setSplitRegions: shell.setSplitRegions,
    setStatus: shell.setStatus,
    setWorkspace: shell.setWorkspace,
    setWorkspaceRuns: shell.setWorkspaceRuns,
  });
  const undoRedo = useUndoRedoController({
    canRedoBoxEdit: boxEdit.canRedoBoxEdit,
    canResetDetectionStage: derived.canResetDetectionStage,
    canUndoBoxEdit: boxEdit.canUndoBoxEdit,
    createHistorySnapshot: history.createHistorySnapshot,
    editingElementId: boxEdit.editingElementId,
    handlePersistedBackStep: fileActions.handlePersistedBackStep,
    handleRedoBoxDraft: boxEdit.handleRedoBoxDraft,
    handleResetDetectionStage: fileActions.handleResetDetectionStage,
    handleUndoBoxDraft: boxEdit.handleUndoBoxDraft,
    persistedBackStep: derived.persistedBackStep,
    persistHistorySnapshot: history.persistHistorySnapshot,
    restoreHistorySnapshot: history.restoreHistorySnapshot,
    segmentDraftHistoryStatus: shell.segmentDraftHistoryStatus,
    segmentEdgeBoardRef: shell.segmentEdgeBoardRef,
    setStatus: shell.setStatus,
    setWorkspaceHistory: history.setWorkspaceHistory,
    workspaceHistory: history.workspaceHistory,
  });

  useAppKeyboardShortcuts({
    beginTemporaryPan: shell.viewport.beginTemporaryPan,
    clearDrafts: canvasInteraction.clearDrafts,
    editingElementId: boxEdit.editingElementId,
    endTemporaryPan: shell.viewport.endTemporaryPan,
    fitCanvas: shell.viewport.fitCanvas,
    handleApplySplit: () => void split.handleApplySplit(),
    handleCancelBoxEdit: boxEdit.handleCancelBoxEdit,
    handleRedo: () => void undoRedo.handleRedo(),
    handleSaveElement: () => void element.handleSaveElement(),
    handleSelectTool: canvasInteraction.handleSelectTool,
    handleStartBoxEdit: boxEdit.handleStartBoxEdit,
    handleTogglePanMode: canvasInteraction.handleTogglePanMode,
    handleUndo: () => void undoRedo.handleUndo(),
    hasUnsavedGeometryChanges: derived.hasUnsavedGeometryChanges,
    selectedElementExists: Boolean(derived.selectedElement),
    splitRegionCount: shell.splitRegions.length,
    workspaceHasSource: Boolean(shell.workspace.source),
    zoomIn: shell.viewport.zoomIn,
    zoomOut: shell.viewport.zoomOut,
  });

  const workflow = buildBoundAppWorkflowState({
    derived,
    detection,
    fileActions,
    shell,
    workflowController,
    workspaceTasks,
  });
  const workbenchProps = buildAppWorkbenchProps({
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
  });

  return <AppWorkbench {...workbenchProps} />;

  async function refreshWorkspaceRuns() {
    try {
      const response = await fetch("/api/workspace/runs");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as WorkspaceRunsResponse;
      shell.setWorkspaceRuns(payload.runs);
    } catch {
      // WHY: 运行记录只是新版多记录 API 的增强能力，旧版单 workspace 仍然可用。
    }
  }

  function replaceWorkspace(
    nextState: WorkspaceState,
    nextStatus: string,
    nextSelectionId?: string | null,
  ) {
    const normalized = normalizeWorkspaceState(nextState);
    const normalizedActionableElements = normalized.elements.filter(isActionableElement);
    shell.setWorkspace(normalized);
    shell.setRenamingElementId(null);
    shell.setExportSummary(null);
    repair.retainRepairMetadataForElementIds(normalized.elements.map((elementItem) => elementItem.id));
    shell.setAssetCacheKey((current) => current + 1);

    const requestedSelectionId = nextSelectionId !== undefined ? nextSelectionId : shell.selectedElementId;
    const resolvedSelectionId =
      requestedSelectionId
      && normalizedActionableElements.some((elementItem) => elementItem.id === requestedSelectionId)
        ? requestedSelectionId
        : normalizedActionableElements[0]?.id ?? null;

    shell.setSelectedElementId(resolvedSelectionId);
    shell.setSelectedElementIds((current) => {
      const existingIds = new Set(normalizedActionableElements.map((elementItem) => elementItem.id));
      const preserved = current.filter((elementId) => existingIds.has(elementId));
      if (preserved.length > 0) {
        return resolvedSelectionId && !preserved.includes(resolvedSelectionId)
          ? [...preserved, resolvedSelectionId]
          : preserved;
      }
      return resolvedSelectionId ? [resolvedSelectionId] : [];
    });
    shell.setStatus(nextStatus);
  }
}
