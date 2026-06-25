import type { AssetContextMenuState, MergeDraft } from "../appStateTypes";
import type { ExportSummary, WorkspaceElement } from "../../domain/workspace";
import {
  canRejectStatus,
  isActionableElement,
  isActiveCandidate,
  isAcceptedStatus,
} from "../../domain/workspaceDerived";
import { AssetContextMenu } from "../../features/elements/AssetContextMenu";
import { MergeAssetDialog } from "../../features/elements/MergeAssetDialog";
import { ModelStatusStrip } from "./ModelStatusStrip";
import { WorkflowToast, type WorkflowToastState } from "./WorkflowToast";

type AppChromeOverlaysProps = {
  assetContextMenu: AssetContextMenuState | null;
  canContextMenuElementJoinMerge: boolean;
  canContextMenuMergeWithSelection: boolean;
  canMergeSelectedElements: boolean;
  contextMenuElement: WorkspaceElement | null;
  contextMenuMergeElements: WorkspaceElement[];
  exportSummary: ExportSummary | null;
  hasUnsavedGeometryChanges: boolean;
  isContextMenuElementSelectedForMerge: boolean;
  isSavingState: boolean;
  mergeDraft: MergeDraft | null;
  mergeDraftElements: WorkspaceElement[];
  status: string;
  workflowToast: WorkflowToastState | null;
  workspaceElements: WorkspaceElement[];
  onAcceptElement: (elementId: string) => void;
  onAddChildFromSelection: () => void;
  onCancelMergeDraft: () => void;
  onCloseAssetContextMenu: () => void;
  onConfirmMergeDraft: () => void;
  onEditBox: () => void;
  onMergeDraftLabelChange: (label: string) => void;
  onMergeSelectedElements: () => void;
  onMergeSelectionToggle: (elementId: string) => void;
  onMergeWithSelection: (elementId: string) => void;
  onRejectElement: (elementId: string) => void;
  onRenameElement: (elementId: string) => void;
  onSplitParent: () => void;
  onWorkflowToastDismiss: () => void;
};

export function AppChromeOverlays({
  assetContextMenu,
  canContextMenuElementJoinMerge,
  canContextMenuMergeWithSelection,
  canMergeSelectedElements,
  contextMenuElement,
  contextMenuMergeElements,
  exportSummary,
  hasUnsavedGeometryChanges,
  isContextMenuElementSelectedForMerge,
  isSavingState,
  mergeDraft,
  mergeDraftElements,
  status,
  workflowToast,
  workspaceElements,
  onAcceptElement,
  onAddChildFromSelection,
  onCancelMergeDraft,
  onCloseAssetContextMenu,
  onConfirmMergeDraft,
  onEditBox,
  onMergeDraftLabelChange,
  onMergeSelectedElements,
  onMergeSelectionToggle,
  onMergeWithSelection,
  onRejectElement,
  onRenameElement,
  onSplitParent,
  onWorkflowToastDismiss,
}: AppChromeOverlaysProps) {
  const canAcceptContextElement = contextMenuElement
    ? isActiveCandidate(contextMenuElement) && !isAcceptedStatus(contextMenuElement.status)
    : false;
  const canRejectContextElement = contextMenuElement
    ? isActiveCandidate(contextMenuElement) && canRejectStatus(contextMenuElement.status)
    : false;

  return (
    <>
      <ModelStatusStrip
        elements={workspaceElements}
        status={status}
        isSaving={isSavingState}
        exportSummary={exportSummary}
      />
      <WorkflowToast toast={workflowToast} onDismiss={onWorkflowToastDismiss} />
      {mergeDraft ? (
        <MergeAssetDialog
          elements={mergeDraftElements}
          label={mergeDraft.label}
          onLabelChange={onMergeDraftLabelChange}
          onCancel={onCancelMergeDraft}
          onConfirm={onConfirmMergeDraft}
        />
      ) : null}
      {assetContextMenu && contextMenuElement && isActionableElement(contextMenuElement) ? (
        <AssetContextMenu
          x={assetContextMenu.x}
          y={assetContextMenu.y}
          element={contextMenuElement}
          selectedMergeElements={contextMenuMergeElements}
          canMergeSelectedElements={canMergeSelectedElements}
          isSelectedForMerge={isContextMenuElementSelectedForMerge}
          canSelectForMerge={canContextMenuElementJoinMerge}
          canMergeWithSelection={canContextMenuMergeWithSelection}
          canAccept={canAcceptContextElement}
          canReject={canRejectContextElement}
          hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
          onClose={onCloseAssetContextMenu}
          onToggleMergeSelection={onMergeSelectionToggle}
          onMergeWithSelection={onMergeWithSelection}
          onEditBox={onEditBox}
          onRename={onRenameElement}
          onAddChild={onAddChildFromSelection}
          onSplitParent={onSplitParent}
          onAccept={onAcceptElement}
          onReject={onRejectElement}
          onMerge={onMergeSelectedElements}
        />
      ) : null}
    </>
  );
}
