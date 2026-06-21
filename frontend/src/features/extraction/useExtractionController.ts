import { useState } from "react";

import type { Box, WorkspaceElement, WorkspaceState } from "../../domain/workspace";
import { workspaceApiUrl } from "../../domain/workspace";
import type {
  ClearMaskResponse,
  ExtractWorkspaceResponse,
  ReplaceMaskResponse,
} from "../../domain/workspaceApi";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type UseExtractionControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  clearLocalRepairMetadata: (elementIds: string[]) => void;
  refreshWorkspaceRuns: () => void;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
};

type ExtractAllInput = {
  batchExtractElementIds: string[];
  hasBatchExtractTargets: boolean;
  hasUnsavedGeometryChanges: boolean;
  workspaceHasSource: boolean;
};

export function useExtractionController({
  activeRunId,
  applyWorkspaceMutation,
  clearLocalRepairMetadata,
  refreshWorkspaceRuns,
  setError,
  setStatus,
}: UseExtractionControllerInput) {
  const [isExtracting, setIsExtracting] = useState(false);

  async function handleExtractSelected(
    selectedElement: WorkspaceElement | null,
    canRunSelectedExtraction: boolean,
  ) {
    if (!selectedElement || !canRunSelectedExtraction || isExtracting) {
      return;
    }

    await runExtraction({
      elementIds: [selectedElement.id],
      successStatus: (count) => `Extracted ${count} element${count === 1 ? "" : "s"}.`,
      selectionId: selectedElement.id,
    });
  }

  async function handleExtractAllAccepted({
    batchExtractElementIds,
    hasBatchExtractTargets,
    hasUnsavedGeometryChanges,
    workspaceHasSource,
  }: ExtractAllInput) {
    if (
      !workspaceHasSource
      || !hasBatchExtractTargets
      || isExtracting
      || hasUnsavedGeometryChanges
    ) {
      return;
    }

    await runExtraction({
      elementIds: batchExtractElementIds,
      successStatus: (count) => `Extracted ${count} element${count === 1 ? "" : "s"}.`,
    });
  }

  async function runExtraction(options: {
    elementIds?: string[];
    successStatus: (count: number) => string;
    selectionId?: string;
  }) {
    setIsExtracting(true);
    setStatus("Extracting source pixels...");
    setError(null);

    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/extract", activeRunId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(options.elementIds ? { elementIds: options.elementIds } : {}),
          strategy: "bbox_alpha",
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Extraction failed.");
      }

      const payload = (await response.json()) as ExtractWorkspaceResponse;
      clearLocalRepairMetadata(payload.extractions.map((extraction) => extraction.elementId));
      applyWorkspaceMutation(
        payload.state,
        options.successStatus(payload.extractions.length),
        options.selectionId,
      );
      refreshWorkspaceRuns();
    } catch (extractError) {
      setStatus("Extraction failed.");
      setError(
        extractError instanceof Error ? extractError.message : "Extraction failed.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleClearMask(
    selectedElement: WorkspaceElement | null,
    hasUnsavedGeometryChanges: boolean,
  ) {
    if (!selectedElement || !selectedElement.mask || hasUnsavedGeometryChanges) {
      return;
    }

    setStatus("Clearing mask...");
    setError(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/mask/clear`, activeRunId),
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not clear mask.");
      }

      const payload = (await response.json()) as ClearMaskResponse;
      clearLocalRepairMetadata([selectedElement.id]);
      applyWorkspaceMutation(payload.state, "Mask cleared.", selectedElement.id);
      refreshWorkspaceRuns();
    } catch (clearError) {
      setStatus("Mask clear failed.");
      setError(clearError instanceof Error ? clearError.message : "Could not clear mask.");
    }
  }

  async function handleReplaceMaskByCurrentShape(
    selectedElement: WorkspaceElement | null,
    canRunSelectedExtraction: boolean,
  ) {
    if (!selectedElement || !canRunSelectedExtraction) {
      return;
    }

    setStatus("Replacing mask...");
    setError(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/mask/replace`, activeRunId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shape: {
              type: "rectangle",
              coordinateSpace: "source",
              bbox: selectedElement.bbox as Box,
            },
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not replace mask.");
      }

      const payload = (await response.json()) as ReplaceMaskResponse;
      clearLocalRepairMetadata([selectedElement.id]);
      applyWorkspaceMutation(payload.state, "Mask replaced.", selectedElement.id);
      refreshWorkspaceRuns();
    } catch (replaceError) {
      setStatus("Mask replace failed.");
      setError(replaceError instanceof Error ? replaceError.message : "Could not replace mask.");
    }
  }

  // WHY: extraction 与 mask replace/clear 共用同一组后端副作用和 repair cache 失效规则，
  // 集中后 App 只负责传入当前选择和派生条件，不再重复维护这条资源生命周期。
  return {
    handleClearMask,
    handleExtractAllAccepted,
    handleExtractSelected,
    handleReplaceMaskByCurrentShape,
    isExtracting,
  };
}
