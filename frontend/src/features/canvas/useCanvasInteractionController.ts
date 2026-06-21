import type { Dispatch, SetStateAction } from "react";

import type { AssetContextMenuState, CanvasFocusRequest } from "../../app/appStateTypes";
import type {
  CanvasTool,
  DraftRegion,
  ElementEditorDraft,
  ElementSelectionMode,
  ElementSelectionOptions,
  OverlayState,
  WorkspaceElement,
  WorkspaceState,
} from "../../domain/workspace";
import {
  isDisplayableElement,
  isMergeableElement,
} from "../../domain/workspaceDerived";

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseCanvasInteractionControllerInput = {
  selectedElementIds: string[];
  selectCanvasTool: (tool: CanvasTool) => void;
  setAssetContextMenu: SetState<AssetContextMenuState | null>;
  setCanvasFocusRequest: SetState<CanvasFocusRequest | null>;
  setDraftRegion: SetState<DraftRegion | null>;
  setEditingElementId: SetState<string | null>;
  setElementDraft: SetState<ElementEditorDraft | null>;
  setMissingMaskRegion: SetState<DraftRegion | null>;
  setOverlays: SetState<OverlayState>;
  setRenamingElementId: SetState<string | null>;
  setSelectedElementId: SetState<string | null>;
  setSelectedElementIds: SetState<string[]>;
  setSplitRegions: SetState<DraftRegion[]>;
  togglePanMode: (hasSource: boolean) => boolean;
  visibleElements: WorkspaceElement[];
  workspace: WorkspaceState;
};

export function useCanvasInteractionController({
  selectedElementIds,
  selectCanvasTool,
  setAssetContextMenu,
  setCanvasFocusRequest,
  setDraftRegion,
  setEditingElementId,
  setElementDraft,
  setMissingMaskRegion,
  setOverlays,
  setRenamingElementId,
  setSelectedElementId,
  setSelectedElementIds,
  setSplitRegions,
  togglePanMode,
  visibleElements,
  workspace,
}: UseCanvasInteractionControllerInput) {
  function handleOverlayToggle(key: keyof OverlayState) {
    setOverlays((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function handleSelectElement(
    elementId: string,
    mode: ElementSelectionMode = "replace",
    options: ElementSelectionOptions = {},
  ) {
    if (!workspace.elements.some((element) => element.id === elementId && isDisplayableElement(element))) {
      return;
    }

    if (mode === "focus") {
      setSelectedElementId(elementId);
      setRenamingElementId(null);
      if (options.focusCanvas) {
        requestCanvasFocus(elementId);
      }
      return;
    }

    if (mode === "toggle") {
      const nextSelectedElementIds = selectedElementIds.includes(elementId)
        ? selectedElementIds.filter((currentId) => currentId !== elementId)
        : [...selectedElementIds, elementId];
      const nextFocusedElementId = nextSelectedElementIds.includes(elementId)
        ? elementId
        : nextSelectedElementIds[nextSelectedElementIds.length - 1] ?? null;
      setSelectedElementIds(nextSelectedElementIds);
      setSelectedElementId(nextFocusedElementId);
      setRenamingElementId(null);
      if (options.focusCanvas && nextFocusedElementId) {
        requestCanvasFocus(nextFocusedElementId);
      }
      return;
    }

    setSelectedElementId(elementId);
    setSelectedElementIds([elementId]);
    setRenamingElementId(null);
    if (options.focusCanvas) {
      requestCanvasFocus(elementId);
    }
  }

  function requestCanvasFocus(elementId: string) {
    setCanvasFocusRequest((current) => ({
      elementId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }

  function handleClearSelection() {
    setSelectedElementId(null);
    setSelectedElementIds([]);
    setEditingElementId(null);
    setAssetContextMenu(null);
    setElementDraft(null);
    setRenamingElementId(null);
  }

  function handleMergeSelectionToggle(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isMergeableElement(element))) {
      return;
    }
    handleSelectElement(elementId, "toggle");
  }

  function handleOpenElementContextMenu(
    elementId: string,
    position: { x: number; y: number },
  ) {
    if (!visibleElements.some((element) => element.id === elementId)) {
      return;
    }
    setAssetContextMenu({ elementId, x: position.x, y: position.y });
  }

  function closeAssetContextMenu() {
    setAssetContextMenu(null);
  }

  function handleSelectTool(nextTool: CanvasTool) {
    selectCanvasTool(nextTool);
    if (nextTool !== "select") {
      setEditingElementId(null);
    }
    if (nextTool === "draw") {
      setSplitRegions([]);
      setMissingMaskRegion(null);
    }
    if (nextTool === "split") {
      setDraftRegion(null);
      setMissingMaskRegion(null);
    }
    if (nextTool === "missing-mask") {
      setDraftRegion(null);
      setSplitRegions([]);
      setMissingMaskRegion(null);
    }
    if (nextTool === "select") {
      clearDrafts();
    }
  }

  function handleTogglePanMode() {
    if (!togglePanMode(Boolean(workspace.source))) {
      return;
    }
    setEditingElementId(null);
  }

  function clearDrafts() {
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
  }

  return {
    clearDrafts,
    closeAssetContextMenu,
    handleClearSelection,
    handleMergeSelectionToggle,
    handleOpenElementContextMenu,
    handleOverlayToggle,
    handleSelectElement,
    handleSelectTool,
    handleTogglePanMode,
  };
}
