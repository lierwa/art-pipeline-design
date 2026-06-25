import type {
  AssetRole,
  ElementEditorDraft,
  ElementSelectionMode,
  ElementSelectionOptions,
  MissingMaskDraft,
  OverlayState,
  RepairQaReport,
  SelectedElementIds,
  WorkflowStage,
  WorkspaceElement,
} from "../../domain/workspace";
import type { WorkspaceTaskItemIndex } from "../../domain/workspaceTasks";
import { AssetTreePanel, type AssetTreeReorderPosition } from "./AssetTreePanel";
import { InspectorPanel } from "./InspectorPanel";

type AssetRolePatch = {
  assetRole: AssetRole;
  removeFromParent?: string | null;
};

type AppReviewPanelProps = {
  activeRunId: string | null;
  assetCacheKey: number;
  canRunSelectedExtraction: boolean;
  hasRejectedElements: boolean;
  hasUnsavedGeometryChanges: boolean;
  inspectorDraft: ElementEditorDraft | null;
  isExtracting: boolean;
  isRepairing: boolean;
  missingMaskDraft: MissingMaskDraft | null;
  overlays: OverlayState;
  reviewableElementCount: number;
  selectedElement: WorkspaceElement | null;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  selectedHasMissingMask: boolean;
  selectedHasRepairPackage: boolean;
  selectedRepairQaReport: RepairQaReport | null;
  splitRequestDescription: string;
  taskItemsByElementId: WorkspaceTaskItemIndex;
  visibleElements: WorkspaceElement[];
  workflowStage: WorkflowStage;
  workspaceElements: WorkspaceElement[];
  generateSelection: Record<string, boolean>;
  onClearMask: () => void;
  onCompleteReview: () => void;
  onCreateRepairTask: () => void;
  onCreateSplitRequest: () => void;
  onDrawMissingMask: () => void;
  onDraftChange: (draft: ElementEditorDraft) => void;
  onMissingMaskDraftChange: (draft: MissingMaskDraft) => void;
  onMoveElementToParent: (elementId: string, parentId: string | null) => void;
  onPatchElementRole: (elementId: string, patch: AssetRolePatch) => void;
  onRejectElement: (elementId: string) => void;
  onReExtract: () => void;
  onReorderElement: (
    elementId: string,
    targetElementId: string,
    position: AssetTreeReorderPosition,
  ) => void;
  onToggleAllGenerateSelection: (elementIds: string[], isSelected: boolean) => void;
  onToggleGenerateSelection: (elementId: string, isSelected: boolean) => void;
  onReplaceMaskByCurrentShape: () => void;
  onSaveElement: () => void;
  onSaveMissingMaskFromDraft: () => void;
  onSelectElement: (
    elementId: string,
    mode?: ElementSelectionMode,
    options?: ElementSelectionOptions,
  ) => void;
  onSplitRequestDescriptionChange: (value: string) => void;
  onToggleShowRejected: () => void;
  onToggleVisibility: (elementId: string) => void;
  onValidateRepairOutput: () => void;
};

export function AppReviewPanel({
  activeRunId,
  assetCacheKey,
  canRunSelectedExtraction,
  hasRejectedElements,
  hasUnsavedGeometryChanges,
  inspectorDraft,
  isExtracting,
  isRepairing,
  missingMaskDraft,
  overlays,
  reviewableElementCount,
  selectedElement,
  selectedElementId,
  selectedElementIds,
  selectedHasMissingMask,
  selectedHasRepairPackage,
  selectedRepairQaReport,
  splitRequestDescription,
  taskItemsByElementId,
  visibleElements,
  workflowStage,
  workspaceElements,
  generateSelection,
  onClearMask,
  onCompleteReview,
  onCreateRepairTask,
  onCreateSplitRequest,
  onDrawMissingMask,
  onDraftChange,
  onMissingMaskDraftChange,
  onMoveElementToParent,
  onPatchElementRole,
  onRejectElement,
  onReExtract,
  onReorderElement,
  onToggleAllGenerateSelection,
  onToggleGenerateSelection,
  onReplaceMaskByCurrentShape,
  onSaveElement,
  onSaveMissingMaskFromDraft,
  onSelectElement,
  onSplitRequestDescriptionChange,
  onToggleShowRejected,
  onToggleVisibility,
  onValidateRepairOutput,
}: AppReviewPanelProps) {
  return (
    <section className="right-review-panel" aria-label="Review panel">
      <AssetTreePanel
        elements={visibleElements}
        selectedElementId={selectedElementId}
        selectedElementIds={selectedElementIds}
        workspaceRunId={activeRunId}
        assetCacheKey={assetCacheKey}
        showRejected={overlays.showRejected}
        hasRejectedElements={hasRejectedElements}
        reviewableCount={reviewableElementCount}
        taskItemsByElementId={taskItemsByElementId}
        workflowStage={workflowStage}
        generateSelection={generateSelection}
        onSelectElement={onSelectElement}
        onToggleShowRejected={onToggleShowRejected}
        onToggleVisibility={onToggleVisibility}
        onCompleteReview={onCompleteReview}
        onMoveElementToParent={onMoveElementToParent}
        onRejectElement={onRejectElement}
        onReorderElement={onReorderElement}
        onToggleAllGenerateSelection={onToggleAllGenerateSelection}
        onToggleGenerateSelection={onToggleGenerateSelection}
      />

      <InspectorPanel
        selectedElement={selectedElement}
        elements={workspaceElements}
        draft={inspectorDraft}
        workspaceRunId={activeRunId}
        splitRequestDescription={splitRequestDescription}
        missingMaskDraft={missingMaskDraft}
        repairQaReport={selectedRepairQaReport}
        hasMissingMaskPreview={selectedHasMissingMask}
        hasRepairPackage={selectedHasRepairPackage}
        onDraftChange={onDraftChange}
        onPatchElementRole={onPatchElementRole}
        onSplitRequestDescriptionChange={onSplitRequestDescriptionChange}
        onMissingMaskDraftChange={onMissingMaskDraftChange}
        onSaveElement={onSaveElement}
        onCreateSplitRequest={onCreateSplitRequest}
        onReplaceMaskByCurrentShape={onReplaceMaskByCurrentShape}
        onClearMask={onClearMask}
        onReExtract={onReExtract}
        onDrawMissingMask={onDrawMissingMask}
        onSaveMissingMaskFromDraft={onSaveMissingMaskFromDraft}
        onCreateRepairTask={onCreateRepairTask}
        onValidateRepairOutput={onValidateRepairOutput}
        canExtractSelected={canRunSelectedExtraction}
        hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
        isExtracting={isExtracting}
        isRepairing={isRepairing}
        assetCacheKey={assetCacheKey}
      />
    </section>
  );
}
