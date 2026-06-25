import type { ComponentProps, Ref } from "react";

import type {
  Box,
  CanvasTool,
  DraftRegion,
  ElementSelectionMode,
  ElementSelectionOptions,
  ExportSummary,
  OverlayState,
  RepairMetadata,
  RepairQaReport,
  SelectedElementIds,
  WorkflowStage,
  WorkspaceElement,
  WorkspaceState,
} from "../../domain/workspace";
import type { SegmentMaskPatchRequest } from "../../domain/workspaceApi";
import { CanvasStage } from "./CanvasStage";
import { CanvasToolbar } from "./CanvasToolbar";
import { DetectionPromptBoardDock } from "../detection/DetectionPromptBoardDock";
import { FloatingStageDrawer } from "../segment/FloatingStageDrawer";
import {
  SegmentEdgeBoard,
  type SegmentDraftHistoryStatus,
  type SegmentEdgeBoardHandle,
  type SegmentMaskPatchMeta,
} from "../segment/SegmentEdgeBoard";
import { ExportPanel, ExtractionPreview, RepairComparison } from "../export/WorkspacePreviewPanels";
import { GenerateReviewPanel } from "../generate/GenerateReviewPanel";
import { WorkspaceTaskPanel } from "../tasks/WorkspaceTaskPanel";
import type { WorkspacePendingTask, WorkspaceTask } from "../../domain/workspaceTasks";

type AppCanvasWorkspaceProps = {
  acceptingSegmentElementId: string | null;
  activeRunId: string | null;
  assetCacheKey: number;
  selectedElementAssetCacheKey: number;
  selectedSegmentAssetCacheKey: number;
  canDrawMissingMask: boolean;
  canMergeSelectedElements: boolean;
  canRedo: boolean;
  canUndo: boolean;
  canvasFocusRequest: { elementId: string; sequence: number } | null;
  canvasOverlayElements: WorkspaceElement[];
  canvasPan: { x: number; y: number };
  canvasZoom: number;
  draftRegion: DraftRegion | null;
  editingElementId: string | null;
  exportSummary: ExportSummary | null;
  generateReview: Omit<ComponentProps<typeof GenerateReviewPanel>, "assetCacheKey" | "workspaceRunId">;
  hasUnsavedGeometryChanges: boolean;
  isAnnotating: boolean;
  isCanvasPanMode: boolean;
  isPromptBoardExpanded: boolean;
  isSavingVocabulary: boolean;
  manualElementName: string;
  mergePreview: Box | null;
  missingMaskRegion: DraftRegion | null;
  overlays: OverlayState;
  renamingElementId: string | null;
  segmentEdgeBoardRef: Ref<SegmentEdgeBoardHandle>;
  selectedElement: WorkspaceElement | null;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  selectedHasMissingMask: boolean;
  selectedRepairMetadata: RepairMetadata | null;
  selectedRepairQaReport: RepairQaReport | null;
  selectedSegmentElement: WorkspaceElement | null;
  shouldShowWorkspacePreviews: boolean;
  sourceDetails: string;
  sourceUrl: string | null;
  splitRegions: DraftRegion[];
  suggestingSegmentElementId: string | null;
  pendingTask: WorkspacePendingTask | null;
  tasks: WorkspaceTask[];
  tool: CanvasTool;
  workflowStage: WorkflowStage;
  workspace: WorkspaceState;
  onAcceptSegmentMask: (elementId: string) => void;
  onAddSplitRegion: (region: DraftRegion) => void;
  onApplySplit: () => void;
  onBoxDraftChange: (elementId: string, bbox: Box) => void;
  onCancelBoxEdit: () => void;
  onCancelInlineRenameElement: () => void;
  onClearDrafts: () => void;
  onClearSelection: () => void;
  onClickDetectPoint: (point: { x: number; y: number }) => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onCompleteMissingMaskRegion: (region: DraftRegion) => void;
  onCreateChildElement: (name: string) => void;
  onCreateElement: (name: string) => void;
  onDraftRegionChange: (region: DraftRegion | null) => void;
  onEditBox: () => void;
  onFitCanvas: () => void;
  onManualElementNameChange: (value: string) => void;
  onMergeSelectedElements: () => void;
  onMissingMaskRegionChange: (region: DraftRegion | null) => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onOverlayToggle: (key: keyof OverlayState) => void;
  onPanChange: (deltaX: number, deltaY: number) => void;
  onPatchSegmentMask: (
    elementId: string,
    patch: SegmentMaskPatchRequest,
    meta?: SegmentMaskPatchMeta,
  ) => boolean | void | Promise<boolean | void>;
  onPromptBoardExpandedChange: (isExpanded: boolean) => void;
  onRedo: () => void;
  onRetryFailedTask: (taskId: string) => void;
  onRerunSegmentMasks: (elementIds: string[]) => void;
  onSaveDetectionVocabulary: (labels: string[]) => void;
  onSaveElement: () => void;
  onSelectElement: (
    elementId: string,
    mode?: ElementSelectionMode,
    options?: ElementSelectionOptions,
  ) => void;
  onSelectTool: (tool: CanvasTool) => void;
  onSegmentDraftHistoryChange: (status: SegmentDraftHistoryStatus) => void;
  onStartInlineRenameElement: (elementId: string) => void;
  onTogglePanMode: () => void;
  onUndo: () => void;
  onZoomByGesture: (scaleDelta: number) => void;
  onZoomByWheel: (deltaY: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function AppCanvasWorkspace(props: AppCanvasWorkspaceProps) {
  const {
    acceptingSegmentElementId,
    activeRunId,
    assetCacheKey,
    selectedElementAssetCacheKey,
    selectedSegmentAssetCacheKey,
    canDrawMissingMask,
    canMergeSelectedElements,
    canRedo,
    canUndo,
    canvasFocusRequest,
    canvasOverlayElements,
    canvasPan,
    canvasZoom,
    draftRegion,
    editingElementId,
    exportSummary,
    generateReview,
    hasUnsavedGeometryChanges,
    isAnnotating,
    isCanvasPanMode,
    isPromptBoardExpanded,
    isSavingVocabulary,
    manualElementName,
    mergePreview,
    missingMaskRegion,
    overlays,
    renamingElementId,
    segmentEdgeBoardRef,
    selectedElement,
    selectedElementId,
    selectedElementIds,
    selectedHasMissingMask,
    selectedRepairMetadata,
    selectedRepairQaReport,
    selectedSegmentElement,
    shouldShowWorkspacePreviews,
    sourceDetails,
    sourceUrl,
    splitRegions,
    suggestingSegmentElementId,
    pendingTask,
    tasks,
    tool,
    workflowStage,
    workspace,
    onAcceptSegmentMask,
    onAddSplitRegion,
    onApplySplit,
    onBoxDraftChange,
    onCancelBoxEdit,
    onCancelInlineRenameElement,
    onClearDrafts,
    onClearSelection,
    onClickDetectPoint,
    onCommitRenameElement,
    onCompleteMissingMaskRegion,
    onCreateChildElement,
    onCreateElement,
    onDraftRegionChange,
    onEditBox,
    onFitCanvas,
    onManualElementNameChange,
    onMergeSelectedElements,
    onMissingMaskRegionChange,
    onOpenElementContextMenu,
    onOverlayToggle,
    onPanChange,
    onPatchSegmentMask,
    onPromptBoardExpandedChange,
    onRedo,
    onRetryFailedTask,
    onRerunSegmentMasks,
    onSaveDetectionVocabulary,
    onSaveElement,
    onSelectElement,
    onSelectTool,
    onSegmentDraftHistoryChange,
    onTogglePanMode,
    onUndo,
    onZoomByGesture,
    onZoomByWheel,
    onZoomIn,
    onZoomOut,
  } = props;
  const shouldShowSegmentDrawer = Boolean(selectedSegmentElement && workflowStage !== "generate");
  const shouldShowGenerateDrawer = Boolean(workflowStage === "generate" && workspace.source);
  const hasRunningSam2Task = pendingTask?.type === "sam2_mask_batch"
    || tasks.some((task) => task.type === "sam2_mask_batch" && (task.status === "queued" || task.status === "running"));
  const segmentRerunTargetIds = selectedSegmentElement
    ? (selectedElementIds.length > 0 ? selectedElementIds : [selectedSegmentElement.id])
    : [];

  return (
    <section
      className={`canvas-workspace${shouldShowSegmentDrawer || shouldShowGenerateDrawer ? " has-stage-drawer" : ""}`}
      aria-label="Canvas workspace"
    >
      <CanvasToolbar
        tool={tool}
        overlays={overlays}
        hasSource={workspace.source !== null}
        canClickDetect={workspace.source !== null && !isAnnotating}
        hasSelection={selectedElement !== null}
        canMerge={canMergeSelectedElements}
        canUndo={canUndo}
        canRedo={canRedo}
        zoomPercent={canvasZoom}
        isPanMode={isCanvasPanMode}
        onSelectTool={onSelectTool}
        onToggleOverlay={onOverlayToggle}
        onEditBox={onEditBox}
        onMerge={onMergeSelectedElements}
        onUndo={onUndo}
        onRedo={onRedo}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitCanvas={onFitCanvas}
        onTogglePanMode={onTogglePanMode}
      />

      <div className="canvas-stage-shell">
        <CanvasStage
          sourceUrl={sourceUrl}
          source={workspace.source}
          overlays={overlays}
          overlayElements={canvasOverlayElements}
          selectedElementId={selectedElementId}
          selectedElementIds={selectedElementIds}
          editingElementId={editingElementId}
          mergePreview={mergePreview}
          sourceDetails={sourceDetails}
          tool={tool}
          draftRegion={draftRegion}
          splitRegions={splitRegions}
          missingMaskRegion={missingMaskRegion}
          assetCacheKey={assetCacheKey}
          workspaceRunId={activeRunId}
          canDrawMissingMask={canDrawMissingMask}
          hasUnsavedBoxEdit={editingElementId === selectedElement?.id && hasUnsavedGeometryChanges}
          zoomPercent={canvasZoom}
          isPanMode={isCanvasPanMode}
          panOffset={canvasPan}
          focusRequest={canvasFocusRequest}
          manualElementName={manualElementName}
          renamingElementId={renamingElementId}
          canCreateChildFromDraft={selectedElement !== null}
          onSelectElement={onSelectElement}
          onClearSelection={onClearSelection}
          onOpenElementContextMenu={onOpenElementContextMenu}
          onStartRenameElement={props.onStartInlineRenameElement}
          onCommitRenameElement={onCommitRenameElement}
          onCancelRenameElement={onCancelInlineRenameElement}
          onBoxDraftChange={onBoxDraftChange}
          onZoomByWheel={onZoomByWheel}
          onZoomByGesture={onZoomByGesture}
          onPanChange={onPanChange}
          onDraftRegionChange={onDraftRegionChange}
          onAddSplitRegion={onAddSplitRegion}
          onMissingMaskRegionChange={onMissingMaskRegionChange}
          onCompleteMissingMaskRegion={onCompleteMissingMaskRegion}
          onManualElementNameChange={onManualElementNameChange}
          onCreateElement={onCreateElement}
          onCreateChildElement={onCreateChildElement}
          onConfirmBoxEdit={onSaveElement}
          onCancelBoxEdit={onCancelBoxEdit}
          onClearDrafts={onClearDrafts}
          onApplySplit={onApplySplit}
          onClickDetectPoint={onClickDetectPoint}
        />
        <WorkspaceTaskPanel
          pendingTask={pendingTask}
          tasks={tasks}
          onRetryFailedTask={onRetryFailedTask}
        />
      </div>

      {workspace.source ? (
        <DetectionPromptBoardDock
          labels={workspace.detectionVocabulary}
          disabled={isSavingVocabulary || isAnnotating}
          isExpanded={isPromptBoardExpanded}
          onExpandedChange={onPromptBoardExpandedChange}
          onSave={onSaveDetectionVocabulary}
        />
      ) : null}

      {shouldShowSegmentDrawer && selectedSegmentElement ? (
        <FloatingStageDrawer title="Segment">
          <SegmentEdgeBoard
            ref={segmentEdgeBoardRef}
            element={selectedSegmentElement}
            assetCacheKey={selectedSegmentAssetCacheKey}
            workspaceRunId={activeRunId}
            isSuggesting={suggestingSegmentElementId === selectedSegmentElement.id}
            isAccepting={acceptingSegmentElementId === selectedSegmentElement.id}
            isRerunning={hasRunningSam2Task}
            rerunMaskTargetCount={segmentRerunTargetIds.length}
            onAcceptMask={onAcceptSegmentMask}
            onDraftHistoryChange={onSegmentDraftHistoryChange}
            onPatchMask={onPatchSegmentMask}
            onRerunMask={() => onRerunSegmentMasks(segmentRerunTargetIds)}
          />
        </FloatingStageDrawer>
      ) : null}

      {shouldShowGenerateDrawer ? (
        <FloatingStageDrawer title="Generate">
          <GenerateReviewPanel
            {...generateReview}
            assetCacheKey={assetCacheKey}
            workspaceRunId={activeRunId}
          />
        </FloatingStageDrawer>
      ) : null}

      {shouldShowWorkspacePreviews && workflowStage !== "generate" ? (
        <div className="workspace-preview-panels">
          {selectedElement ? (
            <ExtractionPreview
              selectedElement={selectedElement}
              assetCacheKey={selectedElementAssetCacheKey}
              workspaceRunId={activeRunId}
            />
          ) : null}
          <RepairComparison
            selectedElement={selectedElement}
            qaReport={selectedRepairQaReport}
            repairMetadata={selectedRepairMetadata}
            assetCacheKey={selectedElementAssetCacheKey}
            workspaceRunId={activeRunId}
            hasMissingMaskPreview={selectedHasMissingMask}
          />
          {exportSummary ? (
            <ExportPanel
              summary={exportSummary}
              assetCacheKey={assetCacheKey}
              workspaceRunId={activeRunId}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
