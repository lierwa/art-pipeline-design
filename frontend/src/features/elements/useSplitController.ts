import type { Dispatch, SetStateAction } from "react";

import type { CanvasTool, DraftRegion, WorkspaceElement, WorkspaceState } from "../../domain/workspace";
import { workspaceApiUrl } from "../../domain/workspace";
import type { SplitElementResponse, SplitRequestResponse } from "../../domain/workspaceApi";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseSplitControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  handleSelectTool: (tool: CanvasTool) => void;
  refreshWorkspaceRuns: () => Promise<void>;
  selectedElement: WorkspaceElement | null;
  setCanvasTool: (tool: CanvasTool) => void;
  setError: SetState<string | null>;
  setSplitRegions: SetState<DraftRegion[]>;
  setStatus: SetState<string>;
  splitRegions: DraftRegion[];
  splitRequestDescription: string;
};

export function useSplitController({
  activeRunId,
  applyWorkspaceMutation,
  handleSelectTool,
  refreshWorkspaceRuns,
  selectedElement,
  setCanvasTool,
  setError,
  setSplitRegions,
  setStatus,
  splitRegions,
  splitRequestDescription,
}: UseSplitControllerInput) {
  function handleStartSplitParent() {
    if (!selectedElement) {
      return;
    }
    handleSelectTool("split");
    setStatus("Drag split regions inside the selected parent.");
  }

  async function handleApplySplit() {
    if (!selectedElement || splitRegions.length === 0) {
      return;
    }

    setError(null);
    setStatus("Splitting parent element...");
    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/split`, activeRunId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            regions: splitRegions.map((region) => ({ bbox: region.bbox })),
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not split element.");
      }

      const payload = (await response.json()) as SplitElementResponse;
      applyWorkspaceMutation(payload.state, `Split created ${payload.children.length} child elements.`);
      void refreshWorkspaceRuns();
      setSplitRegions([]);
      setCanvasTool("select");
    } catch (splitError) {
      setStatus("Split failed.");
      setError(splitError instanceof Error ? splitError.message : "Could not split element.");
    }
  }

  async function handleCreateSplitRequest() {
    if (!selectedElement || !splitRequestDescription.trim()) {
      return;
    }

    setError(null);
    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/split-requests", activeRunId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          elementId: selectedElement.id,
          description: splitRequestDescription.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not create split request.");
      }

      const payload = (await response.json()) as SplitRequestResponse;
      // WHY: split request 是人工意图记录，不改变元素几何，所以只更新提示，不写 workspace history。
      setStatus(`Split request saved: ${payload.requestId}`);
    } catch (splitRequestError) {
      setStatus("Split request failed.");
      setError(
        splitRequestError instanceof Error
          ? splitRequestError.message
          : "Could not create split request.",
      );
    }
  }

  return {
    handleApplySplit,
    handleCreateSplitRequest,
    handleStartSplitParent,
  };
}
