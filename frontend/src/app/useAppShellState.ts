import { useRef, useState } from "react";

import type {
  SegmentDraftHistoryStatus,
  SegmentEdgeBoardHandle,
} from "../features/segment/SegmentEdgeBoard";
import type {
  AssetContextMenuState,
  CanvasFocusRequest,
} from "./appStateTypes";
import { useCanvasViewport } from "../features/canvas/useCanvasViewport";
import {
  DEFAULT_OVERLAYS,
  type DraftRegion,
  type ElementEditorDraft,
  EMPTY_STATE,
  type ExportSummary,
  type OverlayState,
  type SelectedElementIds,
  type WorkspaceRunSummary,
  type WorkspaceState,
} from "../domain/workspace";

export type AppShellState = ReturnType<typeof useAppShellState>;

export function useAppShellState() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [workspaceRuns, setWorkspaceRuns] = useState<WorkspaceRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<SelectedElementIds>([]);
  const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const [isSavingState, setIsSavingState] = useState(false);
  const [isPromptBoardExpanded, setIsPromptBoardExpanded] = useState(true);
  const [elementDraft, setElementDraft] = useState<ElementEditorDraft | null>(null);
  const [assetCacheKey, setAssetCacheKey] = useState(0);
  const [elementAssetCacheKeys, setElementAssetCacheKeys] = useState<Record<string, number>>({});
  const viewport = useCanvasViewport();
  const [canvasFocusRequest, setCanvasFocusRequest] = useState<CanvasFocusRequest | null>(null);
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);
  const [manualElementName, setManualElementName] = useState("Manual Element");
  const [splitRegions, setSplitRegions] = useState<DraftRegion[]>([]);
  const [splitRequestDescription, setSplitRequestDescription] = useState("");
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [assetContextMenu, setAssetContextMenu] = useState<AssetContextMenuState | null>(null);
  const [segmentDraftHistoryStatus, setSegmentDraftHistoryStatus] = useState<SegmentDraftHistoryStatus>({
    canUndo: false,
    canRedo: false,
    hasDirtyDraft: false,
  });
  const segmentEdgeBoardRef = useRef<SegmentEdgeBoardHandle | null>(null);

  return {
    activeRunId,
    assetCacheKey,
    assetContextMenu,
    canvasFocusRequest,
    draftRegion,
    elementDraft,
    elementAssetCacheKeys,
    error,
    exportSummary,
    isExporting,
    isPromptBoardExpanded,
    isSavingState,
    manualElementName,
    overlays,
    renamingElementId,
    segmentDraftHistoryStatus,
    segmentEdgeBoardRef,
    selectedElementId,
    selectedElementIds,
    setActiveRunId,
    setAssetCacheKey,
    setAssetContextMenu,
    setCanvasFocusRequest,
    setDraftRegion,
    setElementDraft,
    setElementAssetCacheKeys,
    setError,
    setExportSummary,
    setIsExporting,
    setIsPromptBoardExpanded,
    setIsSavingState,
    setManualElementName,
    setOverlays,
    setRenamingElementId,
    setSegmentDraftHistoryStatus,
    setSelectedElementId,
    setSelectedElementIds,
    setSourceUrl,
    setSplitRegions,
    setSplitRequestDescription,
    setStatus,
    setWorkspace,
    setWorkspaceRuns,
    sourceUrl,
    splitRegions,
    splitRequestDescription,
    status,
    viewport,
    workspace,
    workspaceRuns,
  };
}
