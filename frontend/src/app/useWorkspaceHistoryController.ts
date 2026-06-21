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

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkspaceHistoryControllerInput = {
  activeRunId: string | null;
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
  ) {
    replaceWorkspace(snapshot.state, nextStatus, snapshot.selectedElementId);
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
  ) {
    pushUndoSnapshot();
    replaceWorkspace(nextState, nextStatus, nextSelectionId);
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
    restoreHistorySnapshot(snapshot, nextStatus);
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
      restoreHistorySnapshot({ ...snapshot, state: persistedState }, nextStatus);
      void refreshWorkspaceRuns();
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
