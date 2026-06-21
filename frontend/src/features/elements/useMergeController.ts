import { useState } from "react";

import type { MergeDraft } from "../../app/appStateTypes";
import type { SelectedElementIds, WorkspaceElement, WorkspaceState } from "../../domain/workspace";
import {
  buildDefaultMergeLabel,
  buildUniqueElementName,
  DEFAULT_MERGE_LABEL,
  isMergeableElement,
} from "../../domain/workspaceDerived";
import { mergeWorkspaceElements } from "../../domain/workspaceApi";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type UseMergeControllerInput = {
  activeRunId: string | null;
  selectedElementIds: SelectedElementIds;
  workspace: WorkspaceState;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  refreshWorkspaceRuns: () => void;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
};

export function useMergeController({
  activeRunId,
  selectedElementIds,
  workspace,
  applyWorkspaceMutation,
  refreshWorkspaceRuns,
  setError,
  setStatus,
}: UseMergeControllerInput) {
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);

  function handleMergeSelectedElements(hasUnsavedGeometryChanges: boolean) {
    beginMergeElementsByIds(selectedElementIds, hasUnsavedGeometryChanges);
  }

  function handleMergeWithSelection(elementId: string, hasUnsavedGeometryChanges: boolean) {
    beginMergeElementsByIds([...selectedElementIds, elementId], hasUnsavedGeometryChanges);
  }

  function beginMergeElementsByIds(
    elementIds: string[],
    hasUnsavedGeometryChanges: boolean,
  ) {
    if (hasUnsavedGeometryChanges) {
      return;
    }

    const mergeElementIds = Array.from(new Set(elementIds)).filter((elementId) =>
      workspace.elements.some((element) => element.id === elementId && isMergeableElement(element)),
    );
    if (mergeElementIds.length < 2) {
      return;
    }

    const elementsToMerge = mergeElementIds
      .map((elementId) => workspace.elements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
    setMergeDraft({
      elementIds: mergeElementIds,
      label: buildDefaultMergeLabel(elementsToMerge, workspace.elements),
    });
    setError(null);
    setStatus("Name the merged asset before creating it.");
  }

  async function confirmMergeDraft(hasUnsavedGeometryChanges: boolean) {
    if (!mergeDraft || hasUnsavedGeometryChanges) {
      return;
    }

    const mergeElementIds = Array.from(new Set(mergeDraft.elementIds)).filter((elementId) =>
      workspace.elements.some((element) => element.id === elementId && isMergeableElement(element)),
    );
    if (mergeElementIds.length < 2) {
      setMergeDraft(null);
      return;
    }

    const label = mergeDraft.label.trim() || buildUniqueElementName(DEFAULT_MERGE_LABEL, workspace.elements);
    setError(null);
    setStatus("Merging selected elements...");

    try {
      const payload = await mergeWorkspaceElements({
        elementIds: mergeElementIds,
        label,
      }, activeRunId);
      setMergeDraft(null);
      applyWorkspaceMutation(payload.state, "Merged selected elements.", payload.element.id);
      refreshWorkspaceRuns();
    } catch (mergeError) {
      setStatus("Merge failed.");
      setError(mergeError instanceof Error ? mergeError.message : "Could not merge elements.");
    }
  }

  function cancelMergeDraft() {
    setMergeDraft(null);
    setStatus("Merge cancelled.");
  }

  function handleMergeDraftLabelChange(label: string) {
    setMergeDraft((current) => current ? { ...current, label } : current);
  }

  // WHY: merge draft 是一个独立的“确认前草稿”状态；放在 hook 里可以把命名、
  // 过滤可合并元素、提交 endpoint 和取消语义集中，App 只传当前 unsaved 条件。
  return {
    cancelMergeDraft,
    confirmMergeDraft,
    handleMergeDraftLabelChange,
    handleMergeSelectedElements,
    handleMergeWithSelection,
    mergeDraft,
  };
}
