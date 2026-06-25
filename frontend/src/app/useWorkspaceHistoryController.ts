import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  clearOperationHistory,
  createOperationHistory,
  dropLatestUndoOperation,
  recordOperation,
  type WorkspaceHistorySnapshot,
} from "../domain/operationHistory";
import {
  normalizeWorkspaceState,
  workspaceApiUrl,
  type WorkspaceState,
} from "../domain/workspace";

type WorkspaceReplaceOptions = {
  bumpAssetCache?: boolean;
};

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
  options?: WorkspaceReplaceOptions,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkspaceHistoryControllerInput = {
  activeRunId: string | null;
  bumpElementAssetCacheKey: (elementId: string) => void;
  refreshWorkspaceRuns: () => Promise<void>;
  replaceWorkspace: ReplaceWorkspace;
  selectedElementId: string | null;
  selectedElementIds: string[];
  setError: SetState<string | null>;
  setIsSavingState: SetState<boolean>;
  setSelectedElementId: SetState<string | null>;
  setSelectedElementIds: SetState<string[]>;
  setStatus: SetState<string>;
  setWorkspace: SetState<WorkspaceState>;
  workspace: WorkspaceState;
};

export function useWorkspaceHistoryController({
  activeRunId,
  bumpElementAssetCacheKey,
  refreshWorkspaceRuns,
  replaceWorkspace,
  selectedElementId,
  selectedElementIds,
  setError,
  setIsSavingState,
  setSelectedElementId,
  setSelectedElementIds,
  setStatus,
  setWorkspace,
  workspace,
}: UseWorkspaceHistoryControllerInput) {
  const [workspaceHistory, setWorkspaceHistory] = useState(() =>
    createOperationHistory<WorkspaceHistorySnapshot>(),
  );

  function createHistorySnapshot(): WorkspaceHistorySnapshot {
    return {
      state: workspace,
      selectedElementId,
      selectedElementIds,
    };
  }

  function restoreHistorySnapshot(
    snapshot: WorkspaceHistorySnapshot,
    nextStatus: string,
    options?: WorkspaceReplaceOptions,
  ) {
    replaceWorkspace(snapshot.state, nextStatus, snapshot.selectedElementId, options);
    setSelectedElementIds(snapshot.selectedElementIds);
  }

  function pushUndoSnapshot(snapshot: WorkspaceHistorySnapshot = createHistorySnapshot()) {
    setWorkspaceHistory((current) => recordOperation(current, snapshot));
  }

  function clearWorkspaceHistory() {
    setWorkspaceHistory((current) => clearOperationHistory(current));
  }

  function applyWorkspaceMutation(
    nextState: WorkspaceState,
    nextStatus: string,
    nextSelectionId?: string | null,
    options?: WorkspaceReplaceOptions,
  ) {
    pushUndoSnapshot();
    replaceWorkspace(nextState, nextStatus, nextSelectionId, options);
  }

  async function persistWorkspace(
    nextState: WorkspaceState,
    nextStatus: string,
    nextSelectionId?: string | null,
  ): Promise<boolean> {
    const previousState = workspace;
    const previousSelection = selectedElementId;
    const previousMergeSelection = selectedElementIds;
    pushUndoSnapshot();
    replaceWorkspace(nextState, nextStatus, nextSelectionId);
    setIsSavingState(true);
    setError(null);

    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/state", activeRunId), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextState),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not save workspace state.");
      }

      const persistedState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      replaceWorkspace(
        persistedState,
        nextStatus,
        nextSelectionId !== undefined ? nextSelectionId : previousSelection,
      );
      void refreshWorkspaceRuns();
      return true;
    } catch (saveError) {
      setWorkspaceHistory((current) => dropLatestUndoOperation(current));
      setWorkspace(previousState);
      setSelectedElementId(previousSelection);
      setSelectedElementIds(previousMergeSelection);
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save workspace state.");
      return false;
    } finally {
      setIsSavingState(false);
    }
  }

  async function persistHistorySnapshot(
    snapshot: WorkspaceHistorySnapshot,
    nextStatus: string,
  ): Promise<boolean> {
    const elementAssetCacheTarget = findSingleElementAssetHistoryTarget(workspace, snapshot.state);
    const replaceOptions = elementAssetCacheTarget ? { bumpAssetCache: false } : undefined;
    restoreHistorySnapshot(snapshot, nextStatus, replaceOptions);
    setIsSavingState(true);
    setError(null);

    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/state", activeRunId), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot.state),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not save workspace state.");
      }

      const persistedState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      restoreHistorySnapshot({ ...snapshot, state: persistedState }, nextStatus, replaceOptions);
      if (elementAssetCacheTarget) {
        bumpElementAssetCacheKey(elementAssetCacheTarget);
      } else {
        void refreshWorkspaceRuns();
      }
      return true;
    } catch (saveError) {
      setStatus("History restore failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not restore workspace history.");
      return false;
    } finally {
      setIsSavingState(false);
    }
  }

  return {
    applyWorkspaceMutation,
    clearWorkspaceHistory,
    createHistorySnapshot,
    persistHistorySnapshot,
    persistWorkspace,
    pushUndoSnapshot,
    restoreHistorySnapshot,
    setWorkspaceHistory,
    workspaceHistory,
  };
}

function findSingleElementAssetHistoryTarget(
  previousState: WorkspaceState,
  nextState: WorkspaceState,
): string | null {
  // WHY: Segment mask undo/redo 只是在同一元素的本地派生图之间切换；把它识别成
  // 元素级恢复，才能避免 history restore 触发全局 runs 刷新和整批缩略图重载。
  if (
    JSON.stringify(previousState.source) !== JSON.stringify(nextState.source)
    || JSON.stringify(previousState.detectionVocabulary) !== JSON.stringify(nextState.detectionVocabulary)
    || previousState.elements.length !== nextState.elements.length
  ) {
    return null;
  }

  let changedElementId: string | null = null;
  for (let index = 0; index < previousState.elements.length; index += 1) {
    const previousElement = previousState.elements[index];
    const nextElement = nextState.elements[index];
    if (!previousElement || !nextElement || previousElement.id !== nextElement.id) {
      return null;
    }
    if (JSON.stringify(previousElement) === JSON.stringify(nextElement)) {
      continue;
    }
    if (
      changedElementId
      || JSON.stringify(stripLocalAssetFields(previousElement)) !== JSON.stringify(stripLocalAssetFields(nextElement))
    ) {
      return null;
    }
    changedElementId = previousElement.id;
  }

  return changedElementId;
}

function stripLocalAssetFields(element: WorkspaceState["elements"][number]) {
  const {
    exportStatus,
    mask,
    repairStatus,
    segmentationQuality,
    segmentationStatus,
    sourceProvider,
    ...stableElement
  } = element;
  return stableElement;
}
