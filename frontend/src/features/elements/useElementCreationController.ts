import type { Dispatch, SetStateAction } from "react";

import { buildDefaultChildBox } from "../../domain/elementDraft";
import {
  createWorkspaceChildElement,
  type CreateElementResponse,
} from "../../domain/workspaceApi";
import {
  type CanvasTool,
  type DraftRegion,
  type WorkspaceElement,
  workspaceApiUrl,
  type WorkspaceState,
} from "../../domain/workspace";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseElementCreationControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  clearBoxEditHistory: () => void;
  draftRegion: DraftRegion | null;
  manualElementName: string;
  refreshWorkspaceRuns: () => Promise<void>;
  selectedElement: WorkspaceElement | null;
  setCanvasTool: (tool: CanvasTool) => void;
  setDraftRegion: SetState<DraftRegion | null>;
  setEditingElementId: SetState<string | null>;
  setError: SetState<string | null>;
  setManualElementName: SetState<string>;
  setRenamingElementId: SetState<string | null>;
  setStatus: SetState<string>;
  workspace: WorkspaceState;
};

export function useElementCreationController({
  activeRunId,
  applyWorkspaceMutation,
  clearBoxEditHistory,
  draftRegion,
  manualElementName,
  refreshWorkspaceRuns,
  selectedElement,
  setCanvasTool,
  setDraftRegion,
  setEditingElementId,
  setError,
  setManualElementName,
  setRenamingElementId,
  setStatus,
  workspace,
}: UseElementCreationControllerInput) {
  async function handleCreateElement(nameOverride?: string) {
    if (!workspace.source || !draftRegion) {
      return;
    }

    const elementName = nameOverride?.trim() || manualElementName.trim() || "Manual Element";
    setError(null);
    setStatus("Creating manual element...");

    try {
      const response = await fetch(workspaceApiUrl("/api/workspace/elements", activeRunId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: elementName,
          bbox: draftRegion.bbox,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not create element.");
      }

      const payload = (await response.json()) as CreateElementResponse;
      applyWorkspaceMutation(payload.state, "Manual element created.", payload.element.id);
      void refreshWorkspaceRuns();
      resetCreationDraft();
    } catch (createError) {
      setStatus("Manual element creation failed.");
      setError(createError instanceof Error ? createError.message : "Could not create element.");
    }
  }

  async function handleCreateChildElement(nameOverride?: string) {
    if (!workspace.source || !draftRegion || !selectedElement) {
      return;
    }

    setError(null);
    setStatus("Creating child element...");

    try {
      const payload = await createWorkspaceChildElement(
        selectedElement.id,
        {
          label: nameOverride?.trim() || manualElementName.trim() || "Child Element",
          bbox: draftRegion.bbox,
        },
        activeRunId,
      );
      applyWorkspaceMutation(payload.state, "Child element created.", payload.element.id);
      void refreshWorkspaceRuns();
      resetCreationDraft();
    } catch (createError) {
      setStatus("Child element creation failed.");
      setError(createError instanceof Error ? createError.message : "Could not create child element.");
    }
  }

  function handleAddChildFromSelection() {
    if (!selectedElement) {
      return;
    }

    setDraftRegion({ bbox: buildDefaultChildBox(selectedElement.bbox) });
    setManualElementName(`${selectedElement.label ?? selectedElement.name} detail`);
    setCanvasTool("draw");
    setEditingElementId(null);
    setRenamingElementId(null);
    clearBoxEditHistory();
    setStatus("Name and adjust the child draft, then create it.");
    setError(null);
  }

  function resetCreationDraft() {
    setManualElementName("Manual Element");
    setDraftRegion(null);
    setCanvasTool("select");
  }

  return {
    handleAddChildFromSelection,
    handleCreateChildElement,
    handleCreateElement,
  };
}
