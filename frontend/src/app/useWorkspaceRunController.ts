import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  DraftRegion,
  DuplicateWorkspaceRunResponse,
  ExportSummary,
  WorkspaceRunSummary,
  WorkspaceState,
} from "../domain/workspace";
import {
  buildSourceUrl,
  EMPTY_STATE,
  normalizeWorkspaceState,
  workspaceApiUrl,
  type WorkspaceRunsResponse,
} from "../domain/workspace";
import {
  isActionableElement,
  shouldCollapsePromptBoardForWorkspace,
} from "../domain/workspaceDerived";

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkspaceRunControllerInput = {
  activeRunId: string | null;
  clearAllLocalRepairState: () => void;
  clearWorkspaceHistory: () => void;
  replaceWorkspace: ReplaceWorkspace;
  resetCanvasViewport: () => void;
  setActiveRunId: SetState<string | null>;
  setDraftRegion: SetState<DraftRegion | null>;
  setEditingElementId: SetState<string | null>;
  setError: SetState<string | null>;
  setExportSummary: SetState<ExportSummary | null>;
  setIsPromptBoardExpanded: SetState<boolean>;
  setMissingMaskRegion: SetState<DraftRegion | null>;
  setRenamingElementId: SetState<string | null>;
  setSelectedElementId: SetState<string | null>;
  setSelectedElementIds: SetState<string[]>;
  setSourceUrl: SetState<string | null>;
  setSplitRegions: SetState<DraftRegion[]>;
  setStatus: SetState<string>;
  setWorkspace: SetState<WorkspaceState>;
  setWorkspaceRuns: SetState<WorkspaceRunSummary[]>;
};

export function useWorkspaceRunController({
  activeRunId,
  clearAllLocalRepairState,
  clearWorkspaceHistory,
  replaceWorkspace,
  resetCanvasViewport,
  setActiveRunId,
  setDraftRegion,
  setEditingElementId,
  setError,
  setExportSummary,
  setIsPromptBoardExpanded,
  setMissingMaskRegion,
  setRenamingElementId,
  setSelectedElementId,
  setSelectedElementIds,
  setSourceUrl,
  setSplitRegions,
  setStatus,
  setWorkspace,
  setWorkspaceRuns,
}: UseWorkspaceRunControllerInput) {
  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setError(null);
    try {
      const response = await fetch("/api/workspace/runs");
      if (!response.ok) {
        throw new Error("Could not load processing records.");
      }

      const payload = (await response.json()) as WorkspaceRunsResponse;
      setWorkspaceRuns(payload.runs);
      resetCurrentWorkspace("Ready");
    } catch {
      await loadLegacyWorkspace();
    }
  }

  async function loadLegacyWorkspace() {
    setError(null);
    try {
      const response = await fetch("/api/workspace/state");
      if (!response.ok) {
        throw new Error("Could not load workspace state.");
      }

      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      setActiveRunId(null);
      setWorkspaceRuns([]);
      setWorkspace(nextState);
      setIsPromptBoardExpanded(!shouldCollapsePromptBoardForWorkspace(nextState));
      clearWorkspaceHistory();
      const firstElementId = nextState.elements.find(isActionableElement)?.id ?? null;
      setSelectedElementId(firstElementId);
      setSelectedElementIds(firstElementId ? [firstElementId] : []);
      setExportSummary(null);
      setStatus(nextState.source ? "Workspace loaded." : "Ready");
    } catch (loadError) {
      setStatus("Workspace load failed.");
      setError(loadError instanceof Error ? loadError.message : "Could not load workspace state.");
    }
  }

  function resetCurrentWorkspace(nextStatus: string) {
    setActiveRunId(null);
    setWorkspace(EMPTY_STATE);
    setIsPromptBoardExpanded(true);
    setSourceUrl((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setSelectedElementId(null);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setRenamingElementId(null);
    setExportSummary(null);
    resetCanvasViewport();
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
    clearAllLocalRepairState();
    clearWorkspaceHistory();
    setStatus(nextStatus);
  }

  async function handleSelectRun(runId: string) {
    setStatus("Loading processing record...");
    setError(null);
    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/state", runId));
      if (!response.ok) {
        throw new Error("Could not load processing record.");
      }

      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      setActiveRunId(runId);
      clearAllLocalRepairState();
      setSelectedElementIds([]);
      resetCanvasViewport();
      setDraftRegion(null);
      setSplitRegions([]);
      setMissingMaskRegion(null);
      clearWorkspaceHistory();
      setIsPromptBoardExpanded(!shouldCollapsePromptBoardForWorkspace(nextState));
      replaceWorkspace(nextState, nextState.source ? "Processing record loaded." : "Ready", null);
    } catch (loadError) {
      setStatus("Processing record load failed.");
      setError(loadError instanceof Error ? loadError.message : "Could not load processing record.");
    }
  }

  async function handleDeleteRun(runId: string) {
    setStatus("Deleting processing record...");
    setError(null);
    try {
      const response = await fetch(`/api/workspace/runs/${encodeURIComponent(runId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not delete processing record.");
      }

      const payload = (await response.json()) as WorkspaceRunsResponse;
      setWorkspaceRuns(payload.runs);
      if (activeRunId === runId) {
        resetCurrentWorkspace("Processing record deleted.");
        return;
      }
      setStatus("Processing record deleted.");
    } catch (deleteError) {
      setStatus("Processing record delete failed.");
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete processing record.");
    }
  }

  async function handleDuplicateRun(runId: string) {
    setStatus("Duplicating processing record...");
    setError(null);
    try {
      const response = await fetch(`/api/workspace/runs/${encodeURIComponent(runId)}/duplicate`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not duplicate processing record.");
      }

      const payload = (await response.json()) as DuplicateWorkspaceRunResponse;
      const nextState = normalizeWorkspaceState(payload.state);
      setWorkspaceRuns(payload.runs);
      setActiveRunId(payload.run.id);
      setSourceUrl((current) => {
        if (current?.startsWith("blob:")) {
          URL.revokeObjectURL(current);
        }
        return nextState.source ? buildSourceUrl(Date.now(), payload.run.id) : null;
      });
      clearAllLocalRepairState();
      setSelectedElementIds([]);
      resetCanvasViewport();
      setDraftRegion(null);
      setSplitRegions([]);
      setMissingMaskRegion(null);
      clearWorkspaceHistory();
      setIsPromptBoardExpanded(!shouldCollapsePromptBoardForWorkspace(nextState));
      replaceWorkspace(nextState, nextState.source ? "Processing record duplicated." : "Ready", null);
    } catch (duplicateError) {
      setStatus("Processing record duplicate failed.");
      setError(duplicateError instanceof Error ? duplicateError.message : "Could not duplicate processing record.");
    }
  }

  return {
    handleDeleteRun,
    handleDuplicateRun,
    handleSelectRun,
  };
}
