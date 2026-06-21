import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AssetContextMenuState } from "./appStateTypes";
import type { SegmentDraftHistoryStatus } from "../features/segment/SegmentEdgeBoard";
import { draftFromElement } from "../domain/elementDraft";
import {
  buildSourceUrl,
  type ElementEditorDraft,
  type WorkspaceElement,
} from "../domain/workspace";

type SetState<T> = Dispatch<SetStateAction<T>>;

type UseAppLifecycleEffectsInput = {
  activeRunId: string | null;
  assetContextMenu: AssetContextMenuState | null;
  clearBoxEditHistory: () => void;
  selectRepairElement: (element: WorkspaceElement | null) => void;
  selectedElement: WorkspaceElement | null;
  selectedElementId: string | null;
  selectedSegmentElement: WorkspaceElement | null;
  setAssetContextMenu: SetState<AssetContextMenuState | null>;
  setEditingElementId: SetState<string | null>;
  setElementDraft: SetState<ElementEditorDraft | null>;
  setSegmentDraftHistoryStatus: SetState<SegmentDraftHistoryStatus>;
  setSelectedElementId: SetState<string | null>;
  setSourceUrl: SetState<string | null>;
  setSplitRequestDescription: SetState<string>;
  sourceUrl: string | null;
  visibleElements: WorkspaceElement[];
  workspaceHasSource: boolean;
};

export function useAppLifecycleEffects({
  activeRunId,
  assetContextMenu,
  clearBoxEditHistory,
  selectRepairElement,
  selectedElement,
  selectedElementId,
  selectedSegmentElement,
  setAssetContextMenu,
  setEditingElementId,
  setElementDraft,
  setSegmentDraftHistoryStatus,
  setSelectedElementId,
  setSourceUrl,
  setSplitRequestDescription,
  sourceUrl,
  visibleElements,
  workspaceHasSource,
}: UseAppLifecycleEffectsInput) {
  useEffect(() => {
    if (!workspaceHasSource) {
      return;
    }
    setSourceUrl((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return buildSourceUrl(Date.now(), activeRunId);
    });
  }, [activeRunId, workspaceHasSource]);

  useEffect(() => {
    return () => {
      if (sourceUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!selectedSegmentElement) {
      setSegmentDraftHistoryStatus({ canUndo: false, canRedo: false, hasDirtyDraft: false });
    }
  }, [selectedSegmentElement]);

  useEffect(() => {
    if (!selectedElement) {
      setElementDraft(null);
      setSplitRequestDescription("");
      selectRepairElement(null);
      return;
    }

    setElementDraft(draftFromElement(selectedElement));
    setSplitRequestDescription("");
    selectRepairElement(selectedElement);
    clearBoxEditHistory();
  }, [selectedElement]);

  useEffect(() => {
    setEditingElementId((current) =>
      current && current !== selectedElement?.id ? null : current,
    );
  }, [selectedElement?.id]);

  useEffect(() => {
    if (
      selectedElementId
      && !visibleElements.some((element) => element.id === selectedElementId)
    ) {
      setSelectedElementId(null);
    }
  }, [selectedElementId, visibleElements]);

  useEffect(() => {
    if (
      assetContextMenu
      && !visibleElements.some((element) => element.id === assetContextMenu.elementId)
    ) {
      setAssetContextMenu(null);
    }
  }, [assetContextMenu, visibleElements]);
}
