import type { ChangeEvent, Dispatch, SetStateAction } from "react";

import { formatExportStatus } from "../features/export/WorkspacePreviewPanels";
import {
  buildSourceUrl,
  EMPTY_STATE,
  type CreateWorkspaceRunResponse,
  type ExportSummary,
  normalizeWorkspaceState,
  workspaceApiUrl,
  type WorkspaceRunSummary,
  type WorkspaceState,
} from "../domain/workspace";
import type { PersistedBackStep } from "../domain/workspaceDerived";
import type { DraftRegion } from "../domain/workspace";

type PersistWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => Promise<boolean>;

type ReplaceWorkspace = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseWorkspaceFileActionsInput = {
  activeRunId: string | null;
  canExportAssetPack: boolean;
  clearAllLocalRepairState: () => void;
  clearWorkspaceHistory: () => void;
  isExporting: boolean;
  isSavingState: boolean;
  persistWorkspace: PersistWorkspace;
  refreshWorkspaceRuns: () => Promise<void>;
  replaceWorkspace: ReplaceWorkspace;
  resetCanvasViewport: () => void;
  setActiveRunId: SetState<string | null>;
  setAssetCacheKey: SetState<number>;
  setDraftRegion: SetState<DraftRegion | null>;
  setError: SetState<string | null>;
  setExportSummary: SetState<ExportSummary | null>;
  setIsExporting: SetState<boolean>;
  setIsPromptBoardExpanded: SetState<boolean>;
  setSelectedElementId: SetState<string | null>;
  setSourceUrl: SetState<string | null>;
  setSplitRegions: SetState<DraftRegion[]>;
  setStatus: SetState<string>;
  setWorkspace: SetState<WorkspaceState>;
  setWorkspaceRuns: SetState<WorkspaceRunSummary[]>;
  sourceUrl: string | null;
  workspace: WorkspaceState;
};

export function useWorkspaceFileActions({
  activeRunId,
  canExportAssetPack,
  clearAllLocalRepairState,
  clearWorkspaceHistory,
  isExporting,
  isSavingState,
  persistWorkspace,
  refreshWorkspaceRuns,
  replaceWorkspace,
  resetCanvasViewport,
  setActiveRunId,
  setAssetCacheKey,
  setDraftRegion,
  setError,
  setExportSummary,
  setIsExporting,
  setIsPromptBoardExpanded,
  setSelectedElementId,
  setSourceUrl,
  setSplitRegions,
  setStatus,
  setWorkspace,
  setWorkspaceRuns,
  sourceUrl,
  workspace,
}: UseWorkspaceFileActionsInput) {
  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const optimisticUrl = URL.createObjectURL(file);
    if (sourceUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(sourceUrl);
    }
    setSourceUrl(optimisticUrl);
    setStatus("Uploading source image...");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/workspace/runs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Upload failed.");
      }

      URL.revokeObjectURL(optimisticUrl);
      const payload = (await response.json()) as CreateWorkspaceRunResponse;
      const nextState = normalizeWorkspaceState(payload.state);
      setWorkspaceRuns((current) => [
        payload.run,
        ...current.filter((run) => run.id !== payload.run.id),
      ]);
      setActiveRunId(payload.run.id);
      setIsPromptBoardExpanded(true);
      replaceWorkspace(nextState, "Source image uploaded.", null);
      clearWorkspaceHistory();
      setSourceUrl(buildSourceUrl(Date.now(), payload.run.id));
      resetCanvasViewport();
      setDraftRegion(null);
      setSplitRegions([]);
      clearAllLocalRepairState();
      setExportSummary(null);
    } catch (uploadError) {
      URL.revokeObjectURL(optimisticUrl);
      setSourceUrl(null);
      setWorkspace(EMPTY_STATE);
      setSelectedElementId(null);
      setStatus("Upload failed.");
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleResetDetectionStage() {
    if (!workspace.source || isSavingState) {
      return;
    }

    const resetState: WorkspaceState = {
      source: workspace.source,
      elements: [],
      detectionVocabulary: workspace.detectionVocabulary,
    };

    // WHY: 重启后内存 undo 栈会丢失；检测阶段回退必须能从持久化 state 推导。
    const restored = await persistWorkspace(resetState, "Detection reset.", null);
    if (restored) {
      setIsPromptBoardExpanded(true);
    }
  }

  async function handlePersistedBackStep(step: PersistedBackStep) {
    if (isSavingState) {
      return;
    }

    const restored = await persistWorkspace(step.state, step.status, step.selectionId);
    if (restored && step.promptBoardExpanded !== undefined) {
      setIsPromptBoardExpanded(step.promptBoardExpanded);
    }
  }

  async function handleExportAssetPack() {
    if (!canExportAssetPack || isExporting) {
      return;
    }

    setIsExporting(true);
    setStatus("Exporting asset pack...");
    setError(null);
    setExportSummary(null);

    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/export", activeRunId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowIncompleteVisibleOnly: false }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Export failed.");
      }

      const payload = (await response.json()) as ExportSummary;
      setExportSummary(payload);
      setAssetCacheKey((current) => current + 1);
      setStatus(formatExportStatus(payload));
      void refreshWorkspaceRuns();
    } catch (exportError) {
      setExportSummary(null);
      setStatus("Export failed.");
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  return {
    handleExportAssetPack,
    handlePersistedBackStep,
    handleResetDetectionStage,
    handleUpload,
  };
}
