import type { Dispatch, SetStateAction } from "react";

import type { AssetTreeReorderPosition } from "../inspector/AssetTreePanel";
import {
  buildElementFromDraft,
  buildElementPatchFromDraft,
  canPatchElementDraft,
  draftFromElement,
  hasPatchableContentChanges,
  isGeometryDraftDirty,
} from "../../domain/elementDraft";
import {
  patchWorkspaceElement,
  patchWorkspaceElementParent,
  type PatchWorkspaceElementRequest,
} from "../../domain/workspaceApi";
import {
  isActionableElement,
  isSegmentableWorkbenchElement,
  needsElementReview,
  reorderWorkspaceElementNearTarget,
} from "../../domain/workspaceDerived";
import {
  type ElementEditorDraft,
  type SelectedElementIds,
  updateElement,
  type WorkspaceElement,
  type WorkspaceState,
} from "../../domain/workspace";
import type { WorkspaceHistorySnapshot } from "../../domain/operationHistory";

type PersistWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => Promise<boolean>;

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseElementControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  clearBoxEditHistory: () => void;
  clearLocalRepairMetadata: (elementIds: string[]) => void;
  elementDraft: ElementEditorDraft | null;
  handleSuggestAllSegmentMasks: (
    nextSelectionId?: string | null,
    undoSnapshot?: WorkspaceHistorySnapshot,
  ) => Promise<void>;
  hasUnsavedGeometryChanges: boolean;
  persistWorkspace: PersistWorkspace;
  refreshWorkspaceRuns: () => Promise<void>;
  selectedElement: WorkspaceElement | null;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  setEditingElementId: SetState<string | null>;
  setElementDraft: SetState<ElementEditorDraft | null>;
  setError: SetState<string | null>;
  setIsSavingState: SetState<boolean>;
  setRenamingElementId: SetState<string | null>;
  setSelectedElementId: SetState<string | null>;
  setSelectedElementIds: SetState<SelectedElementIds>;
  setStatus: SetState<string>;
  workspace: WorkspaceState;
};

export function useElementController({
  activeRunId,
  applyWorkspaceMutation,
  clearBoxEditHistory,
  clearLocalRepairMetadata,
  elementDraft,
  handleSuggestAllSegmentMasks,
  hasUnsavedGeometryChanges,
  persistWorkspace,
  refreshWorkspaceRuns,
  selectedElement,
  selectedElementId,
  selectedElementIds,
  setEditingElementId,
  setElementDraft,
  setError,
  setIsSavingState,
  setRenamingElementId,
  setSelectedElementId,
  setSelectedElementIds,
  setStatus,
  workspace,
}: UseElementControllerInput) {
  async function handleAccept(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        status: "accepted",
        mode: "visible_only",
        visible: true,
      })),
    };
    setSelectedElementId(elementId);
    await persistWorkspace(nextState, "Element accepted.");
  }

  async function handleReject(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        status: "rejected",
        mode: "rejected",
        visible: false,
      })),
    };
    await persistWorkspace(nextState, "Element rejected.", null);
  }

  async function handleCompleteReview() {
    const reviewableElements = workspace.elements.filter(needsElementReview);
    if (reviewableElements.length === 0) {
      setError(null);
      setStatus("Review is already complete.");
      return;
    }

    const reviewedAt = new Date().toISOString();
    const reviewableIds = new Set(reviewableElements.map((element) => element.id));
    const nextState = {
      ...workspace,
      elements: workspace.elements.map((element) => {
        if (!reviewableIds.has(element.id)) {
          return element;
        }
        return {
          ...element,
          status: "accepted" as const,
          mode: "visible_only" as const,
          visible: true,
          history: [
            ...element.history,
            {
              kind: "review_complete",
              at: reviewedAt,
              before: {
                status: element.status,
                mode: element.mode,
                visible: element.visible,
              },
              after: {
                status: "accepted",
                mode: "visible_only",
                visible: true,
              },
            },
          ],
        };
      }),
    };

    const firstSegmentId = nextState.elements.find(isSegmentableWorkbenchElement)?.id ?? null;
    const reviewSaved = await persistWorkspace(
      nextState,
      `Review complete. ${reviewableElements.length} asset${reviewableElements.length === 1 ? "" : "s"} accepted. Running SAM2 masks.`,
      firstSegmentId,
    );
    if (reviewSaved) {
      // WHY: 审核确认后的批量 SAM2 是流程动作，不是单个元素编辑；
      // 这里把审核保存快照交给 segment controller，避免 undo 把两步语义混在一起。
      await handleSuggestAllSegmentMasks(firstSegmentId, {
        state: nextState,
        selectedElementId: firstSegmentId,
        selectedElementIds,
      });
    }
  }

  async function handleVisibilityToggle(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        visible: !element.visible,
      })),
    };
    await persistWorkspace(nextState, "Element visibility updated.");
  }

  async function handleSaveElement() {
    if (!selectedElement || !elementDraft) {
      return;
    }

    const nextElement = buildElementFromDraft(selectedElement, elementDraft);
    if (!nextElement) {
      setError("Element geometry values must be whole numbers.");
      setStatus("State save failed.");
      return;
    }

    const geometryChanged = isGeometryDraftDirty(selectedElement, elementDraft);
    const canPatchDraft = canPatchElementDraft(selectedElement, elementDraft);
    if (hasPatchableContentChanges(selectedElement, elementDraft) && !canPatchDraft) {
      setError("Save geometry or label changes separately from legacy fields.");
      setStatus("State save failed.");
      return;
    }

    if (canPatchDraft) {
      await saveElementPatch(selectedElement, elementDraft, geometryChanged);
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, selectedElement.id, () => nextElement),
    };
    const saved = await persistWorkspace(nextState, "Element details updated.");
    if (saved) {
      setEditingElementId(null);
      clearBoxEditHistory();
    }
    if (saved && geometryChanged) {
      clearLocalRepairMetadata([selectedElement.id]);
    }
  }

  async function saveElementPatch(
    selectedElement: WorkspaceElement,
    elementDraft: ElementEditorDraft,
    geometryChanged: boolean,
  ) {
    const patchRequest = buildElementPatchFromDraft(selectedElement, elementDraft);
    if (!patchRequest) {
      setError("Element geometry values must be whole numbers.");
      setStatus("State save failed.");
      return;
    }
    if (Object.keys(patchRequest).length === 0) {
      setError(null);
      setStatus("Element details unchanged.");
      setElementDraft(draftFromElement(selectedElement));
      setEditingElementId(null);
      clearBoxEditHistory();
      return;
    }

    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElement(selectedElement.id, patchRequest, activeRunId);
      applyWorkspaceMutation(payload.state, "Element details updated. Thumbnail refreshed.", payload.element.id);
      setEditingElementId(null);
      clearBoxEditHistory();
      void refreshWorkspaceRuns();
      if (geometryChanged) {
        clearLocalRepairMetadata([selectedElement.id]);
      }
    } catch (saveError) {
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save element.");
      setElementDraft(draftFromElement(selectedElement));
      clearBoxEditHistory();
    } finally {
      setIsSavingState(false);
    }
  }

  async function handlePatchElementRole(
    elementId: string,
    patchRequest: { assetRole: PatchWorkspaceElementRequest["assetRole"]; removeFromParent?: string | null },
  ) {
    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElement(elementId, patchRequest, activeRunId);
      applyWorkspaceMutation(payload.state, "Element role updated.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save element role.");
    } finally {
      setIsSavingState(false);
    }
  }

  async function handleMoveElementToParent(elementId: string, parentId: string | null) {
    if (elementId === parentId) {
      return;
    }
    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElementParent(elementId, { parentId }, activeRunId);
      const affectedElementIds = parentId ? [elementId, parentId] : [elementId];
      clearLocalRepairMetadata(affectedElementIds);
      applyWorkspaceMutation(payload.state, "Parent relationship updated.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("State save failed.");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update parent relationship.",
      );
    } finally {
      setIsSavingState(false);
    }
  }

  async function handleReorderElement(
    elementId: string,
    targetElementId: string,
    position: AssetTreeReorderPosition,
  ) {
    const nextState = reorderWorkspaceElementNearTarget(
      workspace,
      elementId,
      targetElementId,
      position,
    );
    if (nextState === workspace) {
      return;
    }

    await persistWorkspace(nextState, "Asset order updated.", selectedElementId);
  }

  function handleStartInlineRenameElement(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }
    if (hasUnsavedGeometryChanges) {
      setError("Save geometry changes before renaming.");
      setStatus("Rename blocked.");
      return;
    }
    setEditingElementId(null);
    clearBoxEditHistory();
    setSelectedElementId(elementId);
    setSelectedElementIds([elementId]);
    setRenamingElementId(elementId);
  }

  async function handleCommitInlineRenameElement(elementId: string, nextName: string) {
    const element = workspace.elements.find((candidate) => candidate.id === elementId);
    if (!element || hasUnsavedGeometryChanges) {
      setRenamingElementId(null);
      return;
    }

    const normalizedLabel = nextName.trim() || element.name;
    const currentLabel = element.label ?? element.name;
    if (normalizedLabel === currentLabel) {
      setError(null);
      setStatus("Element details unchanged.");
      setRenamingElementId(null);
      return;
    }

    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElement(element.id, { label: normalizedLabel }, activeRunId);
      applyWorkspaceMutation(payload.state, "Element details updated.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save element.");
    } finally {
      setIsSavingState(false);
    }
  }

  function handleCancelInlineRenameElement() {
    setRenamingElementId(null);
  }

  async function handleRenameElement(elementId: string) {
    const element = workspace.elements.find((candidate) => candidate.id === elementId);
    if (!element || hasUnsavedGeometryChanges) {
      return;
    }

    const nextLabel = window.prompt("Rename asset", element.label ?? element.name);
    if (nextLabel === null) {
      return;
    }

    await handleCommitInlineRenameElement(elementId, nextLabel);
  }

  return {
    handleAccept,
    handleCancelInlineRenameElement,
    handleCommitInlineRenameElement,
    handleCompleteReview,
    handleMoveElementToParent,
    handlePatchElementRole,
    handleReject,
    handleRenameElement,
    handleReorderElement,
    handleSaveElement,
    handleStartInlineRenameElement,
    handleVisibilityToggle,
  };
}
