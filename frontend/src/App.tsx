import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

import { CanvasToolbar } from "./components/CanvasToolbar";
import { CanvasStage } from "./components/CanvasStage";
import { AssetContextMenu } from "./components/AssetContextMenu";
import { AssetTreePanel } from "./components/AssetTreePanel";
import { DetectionVocabularyPanel } from "./components/DetectionVocabularyPanel";
import { FloatingStageDrawer } from "./components/FloatingStageDrawer";
import { InspectorPanel } from "./components/InspectorPanel";
import { ModelStatusStrip } from "./components/ModelStatusStrip";
import { PipelineRail } from "./components/PipelineRail";
import { SegmentEdgeBoard } from "./components/SegmentEdgeBoard";
import { TopAppBar } from "./components/TopAppBar";
import "./styles.css";
import {
  canRedoHistory,
  canUndoHistory,
  clearOperationHistory,
  createOperationHistory,
  dropLatestUndoOperation,
  recordOperation,
  stepOperationHistory,
  type WorkspaceHistorySnapshot,
} from "./operationHistory";
import {
  assetIncompleteUrl,
  AssetRole,
  Box,
  buildSourceUrl,
  CanvasTool,
  CreateWorkspaceRunResponse,
  DEFAULT_OVERLAYS,
  DraftRegion,
  ElementEditorDraft,
  ElementSelectionMode,
  ElementSelectionOptions,
  EMPTY_STATE,
  ExportSummary,
  missingMaskUrl,
  MissingMaskDraft,
  normalizeWorkspaceState,
  OverlayState,
  repairAssetUrl,
  RepairMetadata,
  RepairQaReport,
  SelectedElementIds,
  SourceMetadata,
  sourceCropUrl,
  updateElement,
  workspaceApiUrl,
  WorkspaceElement,
  WorkspaceRunsResponse,
  WorkspaceRunSummary,
  WorkspaceState,
  workspaceAssetUrl,
} from "./workspace";

type CreateElementResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

type WorkspaceElementMutationResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

type PatchWorkspaceElementRequest = {
  bbox?: Box;
  label?: string;
  visible?: boolean;
  assetRole?: AssetRole;
  removeFromParent?: string | null;
};

type ChildWorkspaceElementRequest = {
  label: string;
  bbox: Box;
};

type MergeWorkspaceElementsRequest = {
  elementIds: SelectedElementIds;
  label?: string;
};

type SplitElementResponse = {
  children: WorkspaceElement[];
  state: WorkspaceState;
};

type SplitRequestResponse = {
  requestId: string;
  path: string;
};

type ClickDetectResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

type SegmentSuggestResponse = {
  element: WorkspaceElement;
  segmentation: Record<string, unknown>;
  state: WorkspaceState;
};

type SegmentAcceptResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

type SegmentMaskPatchRequest = {
  operation?: "replace" | "add" | "subtract";
  shape: {
    type: "rectangle";
    coordinateSpace: "canvas";
    bbox: Box;
  };
};

type ExtractWorkspaceResponse = {
  extractions: Array<{
    elementId: string;
    strategy: string;
    maskPath: string;
    assetPath: string;
    sourceCropPath?: string;
  }>;
  state: WorkspaceState;
};

type ClearMaskResponse = {
  state: WorkspaceState;
};

type ReplaceMaskResponse = {
  state: WorkspaceState;
};

type SaveMissingMaskResponse = {
  missingMaskPath: string;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

type CreateRepairTaskResponse = {
  paths: Record<string, string>;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

type ValidateRepairResponse = {
  qa: RepairQaReport;
  repair?: RepairMetadata;
  state: WorkspaceState;
};

type Fetcher = typeof fetch;

const CANVAS_ZOOM_MIN = 40;
const CANVAS_ZOOM_MAX = 200;
const CANVAS_ZOOM_FIT = 80;
const CANVAS_ZOOM_STEP = 5;
const CANVAS_WHEEL_ZOOM_SENSITIVITY = 0.04;
const CANVAS_GESTURE_ZOOM_SENSITIVITY = 60;
const DEFAULT_MERGE_LABEL = "Merged Asset";

type BoxEditHistorySnapshot = {
  elementId: string;
  bbox: Box;
};

type AssetContextMenuState = {
  elementId: string;
  x: number;
  y: number;
};

type CanvasFocusRequest = {
  elementId: string;
  sequence: number;
};

type MergeDraft = {
  elementIds: string[];
  label: string;
};

export async function runWorkspaceDetection(
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceState> {
  return requestJson<WorkspaceState>(
    fetcher,
    workspaceApiUrl("/api/workspace/detect", runId),
    { method: "POST" },
    "Detection failed.",
  );
}

export async function patchWorkspaceElement(
  elementId: string,
  request: PatchWorkspaceElementRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}`, runId),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Could not save element.",
  );
}

export async function createWorkspaceChildElement(
  elementId: string,
  request: ChildWorkspaceElementRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/children`, runId),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Could not create child element.",
  );
}

export async function mergeWorkspaceElements(
  request: MergeWorkspaceElementsRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceElementMutationResponse> {
  return requestJson<WorkspaceElementMutationResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/elements/merge", runId),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Could not merge elements.",
  );
}

export async function saveDetectionVocabulary(
  labels: string[],
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<WorkspaceState> {
  return requestJson<WorkspaceState>(
    fetcher,
    workspaceApiUrl("/api/workspace/detection-vocabulary", runId),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(labels),
    },
    "Could not save detection vocabulary.",
  );
}

export async function clickDetectWorkspace(
  point: { x: number; y: number },
  label: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<ClickDetectResponse> {
  return requestJson<ClickDetectResponse>(
    fetcher,
    workspaceApiUrl("/api/workspace/click-detect", runId),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        x: point.x,
        y: point.y,
        label,
      }),
    },
    "Click detection failed.",
  );
}

export async function suggestElementSegment(
  elementId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentSuggestResponse> {
  return requestJson<SegmentSuggestResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/suggest`, runId),
    { method: "POST" },
    "Could not suggest segment mask.",
  );
}

export async function acceptElementSegment(
  elementId: string,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentAcceptResponse> {
  return requestJson<SegmentAcceptResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/accept`, runId),
    { method: "POST" },
    "Could not accept segment mask.",
  );
}

export async function patchElementSegmentMask(
  elementId: string,
  patch: SegmentMaskPatchRequest,
  runId: string | null = null,
  fetcher: Fetcher = fetch,
): Promise<SegmentSuggestResponse> {
  return requestJson<SegmentSuggestResponse>(
    fetcher,
    workspaceApiUrl(`/api/workspace/elements/${elementId}/segment/mask`, runId),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    },
    "Could not update segment mask.",
  );
}

async function requestJson<T>(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? fallbackError);
  }
  return (await response.json()) as T;
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [workspaceRuns, setWorkspaceRuns] = useState<WorkspaceRunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<SelectedElementIds>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [renamingElementId, setRenamingElementId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [isSavingVocabulary, setIsSavingVocabulary] = useState(false);
  const [elementDraft, setElementDraft] = useState<ElementEditorDraft | null>(null);
  const [assetCacheKey, setAssetCacheKey] = useState(0);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [canvasZoom, setCanvasZoom] = useState(CANVAS_ZOOM_FIT);
  const [isPanMode, setIsPanMode] = useState(false);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [canvasFocusRequest, setCanvasFocusRequest] = useState<CanvasFocusRequest | null>(null);
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);
  const [missingMaskRegion, setMissingMaskRegion] = useState<DraftRegion | null>(null);
  const [manualElementName, setManualElementName] = useState("Manual Element");
  const [splitRegions, setSplitRegions] = useState<DraftRegion[]>([]);
  const [splitRequestDescription, setSplitRequestDescription] = useState("");
  const [missingMaskDraft, setMissingMaskDraft] = useState<MissingMaskDraft | null>(null);
  const [savedMissingMaskElementIds, setSavedMissingMaskElementIds] = useState<string[]>([]);
  const [repairQaReport, setRepairQaReport] = useState<RepairQaReport | null>(null);
  const [repairMetadataByElementId, setRepairMetadataByElementId] = useState<Record<string, RepairMetadata>>({});
  const [isRepairing, setIsRepairing] = useState(false);
  const [suggestingSegmentElementId, setSuggestingSegmentElementId] = useState<string | null>(null);
  const [acceptingSegmentElementId, setAcceptingSegmentElementId] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [assetContextMenu, setAssetContextMenu] = useState<AssetContextMenuState | null>(null);
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null);
  const [workspaceHistory, setWorkspaceHistory] = useState(() =>
    createOperationHistory<WorkspaceHistorySnapshot>(),
  );
  const [boxEditHistory, setBoxEditHistory] = useState(() =>
    createOperationHistory<BoxEditHistorySnapshot>(),
  );
  const missingMaskDraftsRef = useRef<Record<string, MissingMaskDraft>>({});

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!workspace.source) {
      return;
    }
    setSourceUrl((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return buildSourceUrl(Date.now(), activeRunId);
    });
  }, [activeRunId, workspace.source]);

  useEffect(() => {
    return () => {
      if (sourceUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  const sourceDetails = useMemo(() => {
    if (!workspace.source) {
      return "No source loaded";
    }
    return `${workspace.source.filename} - ${workspace.source.width} x ${workspace.source.height}`;
  }, [workspace.source]);

  const visibleElements = useMemo(() => {
    return workspace.elements.filter((element) => {
      if (!isDisplayableElement(element)) {
        return false;
      }
      if (isRejectedElement(element) && !overlays.showRejected) {
        return false;
      }
      return true;
    });
  }, [overlays.showRejected, workspace.elements]);

  const mergeableElements = useMemo(() => {
    return workspace.elements.filter(isMergeableElement);
  }, [workspace.elements]);
  const activeCandidateCount = useMemo(() => {
    return workspace.elements.filter(isActiveCandidate).length;
  }, [workspace.elements]);
  const activeReviewCount = useMemo(() => {
    return workspace.elements.filter(needsElementReview).length;
  }, [workspace.elements]);
  const reviewableElementCount = activeReviewCount;
  const canRunDetection = workspace.source !== null && activeCandidateCount === 0;
  const detectionActionLabel = !workspace.source
    ? "Upload First"
    : activeCandidateCount > 0
      ? activeReviewCount > 0
        ? "Review First"
        : "Detection Done"
      : "Run Detection";
  const detectionActionHelp = !workspace.source
    ? "Upload a source image before running detection."
    : activeCandidateCount > 0
      ? "Finish the current review or create a new run before running detection again."
      : null;

  const overlayElements = useMemo(() => {
    return visibleElements.filter(
      (element) => element.visible || (overlays.showRejected && isRejectedElement(element)),
    );
  }, [overlays.showRejected, visibleElements]);

  const selectedReviewElement = useMemo(() => {
    return visibleElements.find(
      (element) => element.id === selectedElementId && isDisplayableElement(element),
    ) ?? null;
  }, [selectedElementId, visibleElements]);

  const selectedElement = useMemo(() => {
    return selectedReviewElement && isActionableElement(selectedReviewElement)
      ? selectedReviewElement
      : null;
  }, [selectedReviewElement]);
  const selectedSegmentElement = useMemo(() => {
    return selectedElement && isSegmentableWorkbenchElement(selectedElement)
      ? selectedElement
      : null;
  }, [selectedElement]);

  const canvasOverlayElements = useMemo(() => {
    if (!selectedElement || !elementDraft) {
      return overlayElements;
    }

    const draftBbox = parseBox(elementDraft.bbox);
    if (!draftBbox) {
      return overlayElements;
    }

    return overlayElements.map((element) =>
      element.id === selectedElement.id
        ? { ...element, bbox: draftBbox }
        : element,
    );
  }, [elementDraft, overlayElements, selectedElement]);

  const canExtractSelected = useMemo(() => {
    return selectedElement !== null && canExtractElement(selectedElement);
  }, [selectedElement]);

  const hasUnsavedGeometryChanges = useMemo(() => {
    return selectedElement !== null && elementDraft !== null
      ? isGeometryDraftDirty(selectedElement, elementDraft)
      : false;
  }, [elementDraft, selectedElement]);
  const hasUnsavedElementChanges = useMemo(() => {
    return selectedElement !== null && elementDraft !== null
      ? isElementDraftDirty(selectedElement, elementDraft)
      : false;
  }, [elementDraft, selectedElement]);

  const selectedMergeableElements = useMemo(() => {
    return selectedElementIds
      .map((elementId) => mergeableElements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
  }, [mergeableElements, selectedElementIds]);
  const selectedMergeableElementCount = selectedMergeableElements.length;
  const canMergeSelectedElements = !hasUnsavedGeometryChanges && selectedMergeableElementCount >= 2;
  const mergePreview = useMemo(() => {
    if (!canMergeSelectedElements) {
      return null;
    }

    return unionBoxes(selectedMergeableElements.map((element) => element.bbox));
  }, [canMergeSelectedElements, selectedMergeableElements]);

  const canRunSelectedExtraction = canExtractSelected && !hasUnsavedGeometryChanges;
  const contextMenuElement = assetContextMenu
    ? visibleElements.find((element) => element.id === assetContextMenu.elementId) ?? null
    : null;
  const contextMenuMergeElements =
    contextMenuElement ? selectedMergeableElements : [];
  const isContextMenuElementSelectedForMerge = contextMenuElement
    ? selectedElementIds.includes(contextMenuElement.id)
    : false;
  const canContextMenuElementJoinMerge = contextMenuElement
    ? isMergeableElement(contextMenuElement)
    : false;
  const canContextMenuMergeWithSelection = Boolean(
    contextMenuElement
      && canContextMenuElementJoinMerge
      && !isContextMenuElementSelectedForMerge
      && selectedMergeableElementCount >= 1
      && !hasUnsavedGeometryChanges,
  );
  const mergeDraftElements = useMemo(() => {
    if (!mergeDraft) {
      return [];
    }
    return mergeDraft.elementIds
      .map((elementId) => workspace.elements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
  }, [mergeDraft, workspace.elements]);
  const selectedRepairMetadata = selectedElement
    ? repairMetadataByElementId[selectedElement.id] ?? null
    : null;
  const selectedRepairQaReport =
    repairQaReport?.elementId === selectedElement?.id
      ? repairQaReport
      : selectedRepairMetadata?.qaReport ?? null;
  const selectedHasMissingMask = selectedElement
    ? selectedRepairMetadata
      ? selectedRepairMetadata.files.missingMask
      : savedMissingMaskElementIds.includes(selectedElement.id)
    : false;
  const selectedHasRepairPackage = selectedElement
    ? selectedRepairMetadata
      ? selectedRepairMetadata.files.repairPackage
      : hasRepairPackage(selectedElement)
    : false;
  const canDrawMissingMask =
    selectedElement !== null
    && selectedElement.mode === "needs_completion"
    && !hasUnsavedGeometryChanges
    && !isRepairing;

  const batchExtractElementIds = useMemo(() => {
    return workspace.elements
      .filter((element) => isActionableElement(element) && canBatchExtractElement(element))
      .map((element) => element.id);
  }, [workspace.elements]);
  const hasBatchExtractTargets = batchExtractElementIds.length > 0;
  const canExportAssetPack = useMemo(() => {
    return workspace.source !== null && workspace.elements.some(isExportReadyElement);
  }, [workspace.elements, workspace.source]);
  const shouldShowWorkspacePreviews =
    Boolean(selectedElement && (selectedElement.mask || hasExtractedAssetPreview(selectedElement)))
    || Boolean(selectedRepairMetadata)
    || Boolean(selectedRepairQaReport)
    || Boolean(selectedHasMissingMask)
    || exportSummary !== null;

  useEffect(() => {
    if (!selectedElement) {
      setElementDraft(null);
      setSplitRequestDescription("");
      setMissingMaskDraft(null);
      setRepairQaReport(null);
      return;
    }

    setElementDraft(draftFromElement(selectedElement));
    setSplitRequestDescription("");
    setMissingMaskDraft(
      missingMaskDraftsRef.current[selectedElement.id]
        ?? missingMaskDraftFromElement(selectedElement),
    );
    setRepairQaReport((current) =>
      current?.elementId === selectedElement.id ? current : null,
    );
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

  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      const key = event.key.toLowerCase();
      const hasSystemModifier = event.ctrlKey || event.metaKey;

      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (isSpacePanShortcut(event) && workspace.source) {
        event.preventDefault();
        setIsSpacePanning(true);
        return;
      }

      if (hasSystemModifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void handleRedo();
        } else {
          void handleUndo();
        }
        return;
      }

      if (hasSystemModifier && key === "y") {
        event.preventDefault();
        void handleRedo();
        return;
      }

      if (hasSystemModifier && key === "s") {
        event.preventDefault();
        void handleSaveElement();
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        if (editingElementId) {
          handleCancelBoxEdit();
          return;
        }
        clearDrafts();
        handleSelectTool("select");
        return;
      }

      if (key === "enter") {
        if (editingElementId && hasUnsavedGeometryChanges) {
          event.preventDefault();
          void handleSaveElement();
          return;
        }
        if (splitRegions.length > 0) {
          event.preventDefault();
          void handleApplySplit();
        }
        return;
      }

      if (key === "q") {
        event.preventDefault();
        handleSelectTool("select");
        return;
      }

      if (key === "w" && selectedElement) {
        event.preventDefault();
        handleStartBoxEdit();
        return;
      }

      if (key === "e" && workspace.source) {
        event.preventDefault();
        handleSelectTool("draw");
        return;
      }

      if (key === "r" && workspace.source) {
        event.preventDefault();
        handleTogglePanMode();
        return;
      }

      if (key === "+" || key === "=") {
        event.preventDefault();
        handleZoomIn();
        return;
      }

      if (key === "-") {
        event.preventDefault();
        handleZoomOut();
        return;
      }

      if (key === "0") {
        event.preventDefault();
        handleFitCanvas();
      }
    }

    function handleGlobalKeyUp(event: globalThis.KeyboardEvent) {
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (isSpacePanShortcut(event)) {
        event.preventDefault();
        setIsSpacePanning(false);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  });

  useEffect(() => {
    function releaseTemporaryPan() {
      setIsSpacePanning(false);
    }

    window.addEventListener("blur", releaseTemporaryPan);
    return () => window.removeEventListener("blur", releaseTemporaryPan);
  }, []);

  useEffect(() => {
    if (!selectedElement || !shouldLoadRepairMetadata(selectedElement)) {
      return;
    }

    const elementId = selectedElement.id;
    let cancelled = false;
    async function loadMetadata() {
      try {
        const metadata = await fetchRepairMetadata(elementId);
        if (!cancelled) {
          applyRepairMetadata(metadata);
        }
      } catch {
        if (!cancelled) {
          setRepairMetadataByElementId((current) => {
            const next = { ...current };
            delete next[elementId];
            return next;
          });
        }
      }
    }

    void loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [selectedElement?.id, selectedElement?.mode, selectedElement?.status]);

  async function fetchRepairMetadata(elementId: string): Promise<RepairMetadata> {
    const response = await fetch(
      workspaceApiUrl(`/api/workspace/elements/${elementId}/repair/metadata`, activeRunId),
    );
    if (!response.ok) {
      throw new Error("Could not load repair metadata.");
    }
    return (await response.json()) as RepairMetadata;
  }

  function applyRepairMetadata(metadata: RepairMetadata) {
    setRepairMetadataByElementId((current) => ({
      ...current,
      [metadata.elementId]: metadata,
    }));
    setSavedMissingMaskElementIds((current) => {
      if (metadata.files.missingMask) {
        return current.includes(metadata.elementId) ? current : [...current, metadata.elementId];
      }
      return current.filter((elementId) => elementId !== metadata.elementId);
    });
    setRepairQaReport((current) => {
      if (metadata.qaReport) {
        return metadata.qaReport;
      }
      return current?.elementId === metadata.elementId ? null : current;
    });
  }

  function clearLocalRepairMetadata(elementIds: string[]) {
    const ids = new Set(elementIds);
    setRepairMetadataByElementId((current) => {
      return Object.fromEntries(
        Object.entries(current).filter(([elementId]) => !ids.has(elementId)),
      );
    });
    setSavedMissingMaskElementIds((current) => current.filter((elementId) => !ids.has(elementId)));
    setRepairQaReport((current) => current && ids.has(current.elementId) ? null : current);
  }

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
      clearWorkspaceHistory();
      const firstElementId = nextState.elements.find(isActionableElement)?.id ?? null;
      setSelectedElementId(firstElementId);
      setSelectedElementIds(firstElementId ? [firstElementId] : []);
      setExportSummary(null);
      setStatus(nextState.source ? "Workspace loaded." : "Ready");
    } catch (loadError) {
      setStatus("Workspace load failed.");
      setError(
        loadError instanceof Error ? loadError.message : "Could not load workspace state.",
      );
    }
  }

  function resetCurrentWorkspace(nextStatus: string) {
    setActiveRunId(null);
    setWorkspace(EMPTY_STATE);
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
    setTool("select");
    setIsPanMode(false);
    setIsSpacePanning(false);
    setCanvasZoom(CANVAS_ZOOM_FIT);
    setCanvasPan({ x: 0, y: 0 });
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
    clearAllLocalRepairState();
    clearWorkspaceHistory();
    setStatus(nextStatus);
  }

  async function refreshWorkspaceRuns() {
    try {
      const response = await fetch("/api/workspace/runs");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as WorkspaceRunsResponse;
      setWorkspaceRuns(payload.runs);
    } catch {
      // Run records are progressive enhancement over the legacy single-workspace API.
    }
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
      setTool("select");
      setIsPanMode(false);
      setIsSpacePanning(false);
      setCanvasZoom(CANVAS_ZOOM_FIT);
      setCanvasPan({ x: 0, y: 0 });
      setDraftRegion(null);
      setSplitRegions([]);
      setMissingMaskRegion(null);
      clearWorkspaceHistory();
      replaceWorkspace(nextState, nextState.source ? "Processing record loaded." : "Ready", null);
    } catch (loadError) {
      setStatus("Processing record load failed.");
      setError(
        loadError instanceof Error ? loadError.message : "Could not load processing record.",
      );
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
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete processing record.",
      );
    }
  }

  function replaceWorkspace(nextState: WorkspaceState, nextStatus: string, nextSelectionId?: string | null) {
    const normalized = normalizeWorkspaceState(nextState);
    const normalizedActionableElements = normalized.elements.filter(isActionableElement);
    setWorkspace(normalized);
    setRenamingElementId(null);
    setExportSummary(null);
    setRepairMetadataByElementId((current) => {
      const existingIds = new Set(normalized.elements.map((element) => element.id));
      return Object.fromEntries(
        Object.entries(current).filter(([elementId]) => existingIds.has(elementId)),
      );
    });
    setAssetCacheKey((current) => current + 1);
    const requestedSelectionId = nextSelectionId !== undefined ? nextSelectionId : selectedElementId;
    const resolvedSelectionId =
      requestedSelectionId
      && normalizedActionableElements.some((element) => element.id === requestedSelectionId)
        ? requestedSelectionId
        : normalizedActionableElements[0]?.id ?? null;
    setSelectedElementId(resolvedSelectionId);
    setSelectedElementIds((current) => {
      const existingIds = new Set(normalizedActionableElements.map((element) => element.id));
      const preserved = current.filter((elementId) => existingIds.has(elementId));
      if (preserved.length > 0) {
        return resolvedSelectionId && !preserved.includes(resolvedSelectionId)
          ? [...preserved, resolvedSelectionId]
          : preserved;
      }
      return resolvedSelectionId ? [resolvedSelectionId] : [];
    });
    setStatus(nextStatus);
  }

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

  function clearBoxEditHistory() {
    setBoxEditHistory((current) => clearOperationHistory(current));
  }

  function applyWorkspaceMutation(
    nextState: WorkspaceState,
    nextStatus: string,
    nextSelectionId?: string | null,
  ) {
    pushUndoSnapshot();
    replaceWorkspace(nextState, nextStatus, nextSelectionId);
  }

  function clearAllLocalRepairState() {
    setRepairMetadataByElementId({});
    setSavedMissingMaskElementIds([]);
    setRepairQaReport(null);
    setMissingMaskDraft(null);
    setMissingMaskRegion(null);
    missingMaskDraftsRef.current = {};
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
      setError(
        saveError instanceof Error ? saveError.message : "Could not save workspace state.",
      );
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
      restoreHistorySnapshot(
        {
          ...snapshot,
          state: persistedState,
        },
        nextStatus,
      );
      void refreshWorkspaceRuns();
      return true;
    } catch (saveError) {
      setStatus("History restore failed.");
      setError(
        saveError instanceof Error ? saveError.message : "Could not restore workspace history.",
      );
      return false;
    } finally {
      setIsSavingState(false);
    }
  }

  async function handleUndo() {
    if (editingElementId && canUndoHistory(boxEditHistory)) {
      handleUndoBoxDraft();
      return;
    }

    const currentSnapshot = createHistorySnapshot();
    const step = stepOperationHistory(workspaceHistory, "undo", currentSnapshot);
    if (!step.target) {
      return;
    }

    const previousHistory = workspaceHistory;
    setWorkspaceHistory(step.history);
    const restored = await persistHistorySnapshot(step.target, "Undone.");
    if (!restored) {
      setWorkspaceHistory(previousHistory);
      restoreHistorySnapshot(currentSnapshot, "History restore failed.");
    }
  }

  async function handleRedo() {
    if (editingElementId && canRedoHistory(boxEditHistory)) {
      handleRedoBoxDraft();
      return;
    }

    const currentSnapshot = createHistorySnapshot();
    const step = stepOperationHistory(workspaceHistory, "redo", currentSnapshot);
    if (!step.target) {
      return;
    }

    const previousHistory = workspaceHistory;
    setWorkspaceHistory(step.history);
    const restored = await persistHistorySnapshot(step.target, "Redone.");
    if (!restored) {
      setWorkspaceHistory(previousHistory);
      restoreHistorySnapshot(currentSnapshot, "History restore failed.");
    }
  }

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
      replaceWorkspace(nextState, "Source image uploaded.", null);
      clearWorkspaceHistory();
      setSourceUrl(buildSourceUrl(Date.now(), payload.run.id));
      setTool("select");
      setIsPanMode(false);
      setIsSpacePanning(false);
      setCanvasZoom(CANVAS_ZOOM_FIT);
      setCanvasPan({ x: 0, y: 0 });
      setDraftRegion(null);
      setMissingMaskRegion(null);
      setSplitRegions([]);
      setSavedMissingMaskElementIds([]);
      setRepairQaReport(null);
      setExportSummary(null);
    } catch (uploadError) {
      URL.revokeObjectURL(optimisticUrl);
      setSourceUrl(null);
      setWorkspace(EMPTY_STATE);
      setSelectedElementId(null);
      setStatus("Upload failed.");
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleRunDetection() {
    if (!canRunDetection || isAnnotating) {
      return;
    }

    setIsAnnotating(true);
    setStatus("Running model detection...");
    setError(null);

    try {
      const nextState = normalizeWorkspaceState(await runWorkspaceDetection(activeRunId));
      clearAllLocalRepairState();
      setSelectedElementIds([]);
      applyWorkspaceMutation(
        nextState,
        `Detected ${nextState.elements.length} model candidate${nextState.elements.length === 1 ? "" : "s"}.`,
        nextState.elements[0]?.id ?? null,
      );
      void refreshWorkspaceRuns();
    } catch (annotateError) {
      setStatus("Detection failed.");
      setError(
        annotateError instanceof Error ? annotateError.message : "Detection failed.",
      );
    } finally {
      setIsAnnotating(false);
    }
  }

  async function handleSaveDetectionVocabulary(labels: string[]) {
    if (!workspace.source || isSavingVocabulary) {
      return;
    }

    setIsSavingVocabulary(true);
    setStatus("Saving detection vocabulary...");
    setError(null);

    try {
      const nextState = normalizeWorkspaceState(await saveDetectionVocabulary(labels, activeRunId));
      // WHY: 检测词表与 workspace state 同源保存，避免 prompt chips 与后端检测过滤规则出现两个权威来源。
      applyWorkspaceMutation(nextState, "Detection vocabulary saved.", selectedElementId);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("Detection vocabulary save failed.");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save detection vocabulary.",
      );
    } finally {
      setIsSavingVocabulary(false);
    }
  }

  async function handleClickDetectPoint(point: { x: number; y: number }) {
    if (!workspace.source || isAnnotating) {
      return;
    }

    const label = buildClickDetectLabel(selectedElement, workspace.detectionVocabulary);
    setIsAnnotating(true);
    setStatus("Running click detection...");
    setError(null);

    try {
      const payload = await clickDetectWorkspace(point, label, activeRunId);
      applyWorkspaceMutation(payload.state, "Click-detected asset added.", payload.element.id);
      setTool("select");
      void refreshWorkspaceRuns();
    } catch (detectError) {
      setStatus("Click detection failed.");
      setError(detectError instanceof Error ? detectError.message : "Click detection failed.");
    } finally {
      setIsAnnotating(false);
    }
  }

  async function handleSuggestSegmentMask(elementId: string) {
    if (suggestingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setSuggestingSegmentElementId(elementId);
    setStatus("Suggesting segment mask...");
    setError(null);

    try {
      const payload = await suggestElementSegment(elementId, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask suggestion ready.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Segment suggestion failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not suggest segment mask.");
    } finally {
      setSuggestingSegmentElementId(null);
    }
  }

  async function handleAcceptSegmentMask(elementId: string) {
    if (acceptingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setAcceptingSegmentElementId(elementId);
    setStatus("Accepting segment mask...");
    setError(null);

    try {
      const payload = await acceptElementSegment(elementId, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask accepted.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Segment accept failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not accept segment mask.");
    } finally {
      setAcceptingSegmentElementId(null);
    }
  }

  async function handlePatchSegmentMask(elementId: string, patch: SegmentMaskPatchRequest) {
    if (suggestingSegmentElementId || !workspace.elements.some((element) => element.id === elementId)) {
      return;
    }

    setSuggestingSegmentElementId(elementId);
    setStatus("Updating segment mask...");
    setError(null);

    try {
      const payload = await patchElementSegmentMask(elementId, patch, activeRunId);
      clearLocalRepairMetadata([elementId]);
      applyWorkspaceMutation(payload.state, "Mask edit applied.", payload.element.id);
      setAssetCacheKey((current) => current + 1);
      void refreshWorkspaceRuns();
    } catch (segmentError) {
      setStatus("Mask edit failed.");
      setError(segmentError instanceof Error ? segmentError.message : "Could not update segment mask.");
    } finally {
      setSuggestingSegmentElementId(null);
    }
  }

  async function handleExtractSelected() {
    if (!selectedElement || !canRunSelectedExtraction || isExtracting) {
      return;
    }

    await runExtraction({
      elementIds: [selectedElement.id],
      successStatus: (count) => `Extracted ${count} element${count === 1 ? "" : "s"}.`,
      selectionId: selectedElement.id,
    });
  }

  async function handleExtractAllAccepted() {
    if (
      !workspace.source
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
      void refreshWorkspaceRuns();
    } catch (extractError) {
      setStatus("Extraction failed.");
      setError(
        extractError instanceof Error ? extractError.message : "Extraction failed.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleClearMask() {
    if (!selectedElement || !selectedElement.mask || hasUnsavedGeometryChanges) {
      return;
    }

    setStatus("Clearing mask...");
    setError(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/mask/clear`, activeRunId),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not clear mask.");
      }

      const payload = (await response.json()) as ClearMaskResponse;
      clearLocalRepairMetadata([selectedElement.id]);
      applyWorkspaceMutation(payload.state, "Mask cleared.", selectedElement.id);
      void refreshWorkspaceRuns();
    } catch (clearError) {
      setStatus("Mask clear failed.");
      setError(clearError instanceof Error ? clearError.message : "Could not clear mask.");
    }
  }

  async function handleReplaceMaskByCurrentShape() {
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
              bbox: selectedElement.bbox,
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
      void refreshWorkspaceRuns();
    } catch (replaceError) {
      setStatus("Mask replace failed.");
      setError(replaceError instanceof Error ? replaceError.message : "Could not replace mask.");
    }
  }

  function handleStartMissingMaskDrawing() {
    if (!canDrawMissingMask) {
      return;
    }

    setTool("missing-mask");
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
    setStatus("Drag on the canvas to draw the missing mask.");
    setError(null);
  }

  async function handleSaveMissingMaskFromDraft() {
    if (
      !selectedElement
      || !missingMaskDraft
      || selectedElement.mode !== "needs_completion"
      || hasUnsavedGeometryChanges
      || isRepairing
    ) {
      return;
    }

    const bbox = parseBox(missingMaskDraft);
    if (!bbox || bbox.w <= 0 || bbox.h <= 0) {
      setStatus("Missing mask save failed.");
      setError("Missing mask rectangle values must be positive whole numbers.");
      return;
    }
    if (!boxFitsInsideElementCanvas(bbox, selectedElement)) {
      setStatus("Missing mask save failed.");
      setError("Missing mask rectangle must stay inside the selected element canvas.");
      return;
    }

    await saveMissingMaskBox(selectedElement, bbox);
  }

  async function handleCompleteMissingMaskRegion(region: DraftRegion) {
    if (!selectedElement || !canDrawMissingMask) {
      return;
    }

    const bbox = sourceBoxToElementCanvasBox(region.bbox, selectedElement);
    if (!bbox) {
      setStatus("Missing mask save failed.");
      setError("Draw the missing mask inside the selected element canvas.");
      return;
    }

    const nextDraft = boxToDraft(bbox);
    setMissingMaskDraft(nextDraft);
    await saveMissingMaskBox(selectedElement, bbox);
  }

  async function saveMissingMaskBox(element: WorkspaceElement, bbox: Box) {
    setIsRepairing(true);
    setStatus("Saving missing mask...");
    setError(null);
    setRepairQaReport(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${element.id}/repair/missing-mask`, activeRunId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shape: {
              type: "rectangle",
              coordinateSpace: "canvas",
              bbox,
            },
          }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not save missing mask.");
      }

      const payload = (await response.json()) as SaveMissingMaskResponse;
      const savedDraft = boxToDraft(bbox);
      missingMaskDraftsRef.current[element.id] = savedDraft;
      setSavedMissingMaskElementIds((current) =>
        current.includes(element.id) ? current : [...current, element.id],
      );
      applyWorkspaceMutation(payload.state, "Missing mask saved.", element.id);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
      setMissingMaskDraft(savedDraft);
      void refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Missing mask save failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not save missing mask.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  async function handleCreateRepairTask() {
    if (
      !selectedElement
      || selectedElement.mode !== "needs_completion"
      || hasUnsavedGeometryChanges
      || isRepairing
    ) {
      return;
    }

    setIsRepairing(true);
    setStatus("Creating Codex repair task...");
    setError(null);
    setRepairQaReport(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/repair/task`, activeRunId),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not create Codex repair task.");
      }

      const payload = (await response.json()) as CreateRepairTaskResponse;
      setSavedMissingMaskElementIds((current) =>
        current.includes(selectedElement.id) ? current : [...current, selectedElement.id],
      );
      applyWorkspaceMutation(payload.state, "Codex repair task created.", selectedElement.id);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
      void refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Repair task creation failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not create Codex repair task.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  async function handleValidateRepairOutput() {
    if (!selectedElement || isRepairing) {
      return;
    }

    setIsRepairing(true);
    setStatus("Validating repair output...");
    setError(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/repair/validate`, activeRunId),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not validate repair output.");
      }

      const payload = (await response.json()) as ValidateRepairResponse;
      applyWorkspaceMutation(payload.state, `Repair validation: ${payload.qa.status}.`, selectedElement.id);
      setRepairQaReport(payload.qa);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
      void refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Repair validation failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not validate repair output.",
      );
    } finally {
      setIsRepairing(false);
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
    setTool(nextTool);
    setIsPanMode(false);
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
      setDraftRegion(null);
      setSplitRegions([]);
      setMissingMaskRegion(null);
    }
  }

  function handleZoomIn() {
    setCanvasZoom((current) => Math.min(CANVAS_ZOOM_MAX, current + CANVAS_ZOOM_STEP));
  }

  function handleZoomOut() {
    setCanvasZoom((current) => Math.max(CANVAS_ZOOM_MIN, current - CANVAS_ZOOM_STEP));
  }

  function handleCanvasWheelZoom(deltaY: number) {
    if (!workspace.source) {
      return;
    }

    setCanvasZoom((current) =>
      clampNumber(
        current - deltaY * CANVAS_WHEEL_ZOOM_SENSITIVITY,
        CANVAS_ZOOM_MIN,
        CANVAS_ZOOM_MAX,
      ),
    );
  }

  function handleCanvasGestureZoom(scaleDelta: number) {
    if (!workspace.source) {
      return;
    }

    setCanvasZoom((current) =>
      clampNumber(
        current + scaleDelta * CANVAS_GESTURE_ZOOM_SENSITIVITY,
        CANVAS_ZOOM_MIN,
        CANVAS_ZOOM_MAX,
      ),
    );
  }

  function handleFitCanvas() {
    setCanvasZoom(CANVAS_ZOOM_FIT);
    setCanvasPan({ x: 0, y: 0 });
  }

  function handleTogglePanMode() {
    if (!workspace.source) {
      return;
    }
    setTool("select");
    setEditingElementId(null);
    setIsPanMode((current) => !current);
  }

  function handleCanvasPanChange(deltaX: number, deltaY: number) {
    setCanvasPan((current) => ({
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  }

  function handleStartBoxEdit() {
    if (!selectedElement) {
      return;
    }
    handleSelectTool("select");
    setEditingElementId(selectedElement.id);
    clearBoxEditHistory();
    setStatus("Editing selected box.");
    setError(null);
  }

  function handleBoxDraftChange(elementId: string, bbox: Box) {
    if (!selectedElement || selectedElement.id !== elementId || !workspace.source) {
      return;
    }

    const nextBbox = clampBoxToSource(bbox, workspace.source);
    const currentBbox = elementDraft ? parseBox(elementDraft.bbox) : selectedElement.bbox;
    if (currentBbox && !boxesEqual(currentBbox, nextBbox)) {
      setBoxEditHistory((current) =>
        recordOperation(current, { elementId: selectedElement.id, bbox: currentBbox }),
      );
    }
    setElementDraft((current) => {
      const nextDraft = current ?? draftFromElement(selectedElement);
      return {
        ...nextDraft,
        bbox: boxToDraft(nextBbox),
      };
    });
    setError(null);
  }

  function handleCancelBoxEdit() {
    if (selectedElement) {
      setElementDraft(draftFromElement(selectedElement));
    }
    setEditingElementId(null);
    clearBoxEditHistory();
    setError(null);
    setStatus("Box edit cancelled.");
  }

  function currentBoxEditSnapshot(): BoxEditHistorySnapshot | null {
    if (!selectedElement || editingElementId !== selectedElement.id) {
      return null;
    }

    const bbox = elementDraft ? parseBox(elementDraft.bbox) : selectedElement.bbox;
    if (!bbox) {
      return null;
    }

    return {
      elementId: selectedElement.id,
      bbox,
    };
  }

  function applyBoxEditSnapshot(snapshot: BoxEditHistorySnapshot) {
    if (!selectedElement || snapshot.elementId !== selectedElement.id) {
      return;
    }

    setElementDraft((current) => ({
      ...(current ?? draftFromElement(selectedElement)),
      bbox: boxToDraft(snapshot.bbox),
    }));
    setError(null);
  }

  function handleUndoBoxDraft() {
    const currentSnapshot = currentBoxEditSnapshot();
    if (!currentSnapshot) {
      return;
    }

    const step = stepOperationHistory(boxEditHistory, "undo", currentSnapshot);
    if (!step.target) {
      return;
    }

    setBoxEditHistory(step.history);
    applyBoxEditSnapshot(step.target);
    setStatus("Box edit undone.");
  }

  function handleRedoBoxDraft() {
    const currentSnapshot = currentBoxEditSnapshot();
    if (!currentSnapshot) {
      return;
    }

    const step = stepOperationHistory(boxEditHistory, "redo", currentSnapshot);
    if (!step.target) {
      return;
    }

    setBoxEditHistory(step.history);
    applyBoxEditSnapshot(step.target);
    setStatus("Box edit redone.");
  }

  function handleStartSplitParent() {
    if (!selectedElement) {
      return;
    }
    handleSelectTool("split");
    setStatus("Drag split regions inside the selected parent.");
  }

  function clearDrafts() {
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
  }

  async function handleAccept(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        status: "accepted",
        mode: "visible_only",
        visible: true,
      })),
    };
    setSelectedElementId(elementId);
    await persistWorkspace(nextState, "Element accepted.");
  }

  async function handleReject(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        status: "rejected",
        mode: "rejected",
        visible: false,
      })),
    };
    await persistWorkspace(nextState, "Element rejected.", null);
  }

  async function handleCompleteReview() {
    const reviewableElements = workspace.elements.filter(needsElementReview);
    if (reviewableElements.length === 0) {
      setError(null);
      setStatus("Review is already complete.");
      return;
    }

    const reviewedAt = new Date().toISOString();
    const reviewableIds = new Set(reviewableElements.map((element) => element.id));
    const nextState = {
      ...workspace,
      elements: workspace.elements.map((element) => {
        if (!reviewableIds.has(element.id)) {
          return element;
        }
        return {
          ...element,
          status: "accepted" as const,
          mode: "visible_only" as const,
          visible: true,
          history: [
            ...element.history,
            {
              kind: "review_complete",
              at: reviewedAt,
              before: {
                status: element.status,
                mode: element.mode,
                visible: element.visible,
              },
              after: {
                status: "accepted",
                mode: "visible_only",
                visible: true,
              },
            },
          ],
        };
      }),
    };

    await persistWorkspace(
      nextState,
      `Review complete. ${reviewableElements.length} asset${reviewableElements.length === 1 ? "" : "s"} accepted.`,
    );
  }

  async function handleVisibilityToggle(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        visible: !element.visible,
      })),
    };
    await persistWorkspace(nextState, "Element visibility updated.");
  }

  async function handleSaveElement() {
    if (!selectedElement || !elementDraft) {
      return;
    }

    const nextElement = buildElementFromDraft(selectedElement, elementDraft);
    if (!nextElement) {
      setError("Element geometry values must be whole numbers.");
      setStatus("State save failed.");
      return;
    }

    const geometryChanged = isGeometryDraftDirty(selectedElement, elementDraft);
    const canPatchDraft = canPatchElementDraft(selectedElement, elementDraft);
    if (hasPatchableContentChanges(selectedElement, elementDraft) && !canPatchDraft) {
      setError("Save geometry or label changes separately from legacy fields.");
      setStatus("State save failed.");
      return;
    }

    if (canPatchDraft) {
      const patchRequest = buildElementPatchFromDraft(selectedElement, elementDraft);
      if (!patchRequest) {
        setError("Element geometry values must be whole numbers.");
        setStatus("State save failed.");
        return;
      }
      if (Object.keys(patchRequest).length === 0) {
        setError(null);
        setStatus("Element details unchanged.");
        setElementDraft(draftFromElement(selectedElement));
        setEditingElementId(null);
        clearBoxEditHistory();
        return;
      }

      setIsSavingState(true);
      setError(null);

      try {
        const payload = await patchWorkspaceElement(selectedElement.id, patchRequest, activeRunId);
        applyWorkspaceMutation(payload.state, "Element details updated. Thumbnail refreshed.", payload.element.id);
        setEditingElementId(null);
        clearBoxEditHistory();
        void refreshWorkspaceRuns();
        if (geometryChanged) {
          clearLocalRepairMetadata([selectedElement.id]);
        }
      } catch (saveError) {
        setStatus("State save failed.");
        setError(saveError instanceof Error ? saveError.message : "Could not save element.");
        setElementDraft(draftFromElement(selectedElement));
        clearBoxEditHistory();
      } finally {
        setIsSavingState(false);
      }
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, selectedElement.id, () => nextElement),
    };
    const saved = await persistWorkspace(nextState, "Element details updated.");
    if (saved) {
      setEditingElementId(null);
      clearBoxEditHistory();
    }
    if (saved && geometryChanged) {
      clearLocalRepairMetadata([selectedElement.id]);
    }
  }

  async function handlePatchElementRole(
    elementId: string,
    patchRequest: Pick<PatchWorkspaceElementRequest, "assetRole" | "removeFromParent">,
  ) {
    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElement(elementId, patchRequest, activeRunId);
      applyWorkspaceMutation(payload.state, "Element role updated.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save element role.");
    } finally {
      setIsSavingState(false);
    }
  }

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
      setManualElementName("Manual Element");
      setDraftRegion(null);
      setTool("select");
    } catch (createError) {
      setStatus("Manual element creation failed.");
      setError(
        createError instanceof Error ? createError.message : "Could not create element.",
      );
    }
  }

  async function createChildElementFromBox(
    parentElement: WorkspaceElement,
    bbox: Box,
    label: string,
  ) {
    if (!workspace.source) {
      return;
    }

    setError(null);
    setStatus("Creating child element...");

    try {
      const payload = await createWorkspaceChildElement(parentElement.id, {
        label,
        bbox,
      }, activeRunId);
      applyWorkspaceMutation(payload.state, "Child element created.", payload.element.id);
      void refreshWorkspaceRuns();
      setManualElementName("Manual Element");
      setDraftRegion(null);
      setTool("select");
    } catch (createError) {
      setStatus("Child element creation failed.");
      setError(
        createError instanceof Error ? createError.message : "Could not create child element.",
      );
    }
  }

  async function handleCreateChildElement(nameOverride?: string) {
    if (!draftRegion || !selectedElement) {
      return;
    }

    await createChildElementFromBox(
      selectedElement,
      draftRegion.bbox,
      nameOverride?.trim() || manualElementName.trim() || "Child Element",
    );
  }

  function handleStartInlineRenameElement(elementId: string) {
    if (!workspace.elements.some((element) => element.id === elementId && isActionableElement(element))) {
      return;
    }
    if (hasUnsavedGeometryChanges) {
      setError("Save geometry changes before renaming.");
      setStatus("Rename blocked.");
      return;
    }
    setEditingElementId(null);
    clearBoxEditHistory();
    setSelectedElementId(elementId);
    setSelectedElementIds([elementId]);
    setRenamingElementId(elementId);
  }

  async function handleCommitInlineRenameElement(elementId: string, nextName: string) {
    const element = workspace.elements.find((candidate) => candidate.id === elementId);
    if (!element || hasUnsavedGeometryChanges) {
      setRenamingElementId(null);
      return;
    }

    const normalizedLabel = nextName.trim() || element.name;
    const currentLabel = element.label ?? element.name;
    if (normalizedLabel === currentLabel) {
      setError(null);
      setStatus("Element details unchanged.");
      setRenamingElementId(null);
      return;
    }

    setIsSavingState(true);
    setError(null);

    try {
      const payload = await patchWorkspaceElement(
        element.id,
        { label: normalizedLabel },
        activeRunId,
      );
      applyWorkspaceMutation(payload.state, "Element details updated.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (saveError) {
      setStatus("State save failed.");
      setError(saveError instanceof Error ? saveError.message : "Could not save element.");
    } finally {
      setIsSavingState(false);
    }
  }

  function handleCancelInlineRenameElement() {
    setRenamingElementId(null);
  }

  async function handleRenameElement(elementId: string) {
    const element = workspace.elements.find((candidate) => candidate.id === elementId);
    if (!element || hasUnsavedGeometryChanges) {
      return;
    }

    const nextLabel = window.prompt("Rename asset", element.label ?? element.name);
    if (nextLabel === null) {
      return;
    }

    await handleCommitInlineRenameElement(elementId, nextLabel);
  }

  function handleAddChildFromSelection() {
    if (!selectedElement) {
      return;
    }

    setDraftRegion({ bbox: buildDefaultChildBox(selectedElement.bbox) });
    setManualElementName(`${selectedElement.label ?? selectedElement.name} detail`);
    setTool("draw");
    setEditingElementId(null);
    setRenamingElementId(null);
    clearBoxEditHistory();
    setStatus("Name and adjust the child draft, then create it.");
    setError(null);
  }

  async function handleMergeSelectedElements() {
    beginMergeElementsByIds(selectedElementIds);
  }

  function handleMergeWithSelection(elementId: string) {
    beginMergeElementsByIds([...selectedElementIds, elementId]);
  }

  function beginMergeElementsByIds(elementIds: string[]) {
    if (hasUnsavedGeometryChanges) {
      return;
    }

    const mergeElementIds = Array.from(new Set(elementIds)).filter((elementId) =>
      workspace.elements.some((element) => element.id === elementId && isMergeableElement(element)),
    );
    if (mergeElementIds.length < 2) {
      return;
    }

    const elementsToMerge = mergeElementIds
      .map((elementId) => workspace.elements.find((element) => element.id === elementId))
      .filter((element): element is WorkspaceElement => Boolean(element));
    setMergeDraft({
      elementIds: mergeElementIds,
      label: buildDefaultMergeLabel(elementsToMerge, workspace.elements),
    });
    setError(null);
    setStatus("Name the merged asset before creating it.");
  }

  async function confirmMergeDraft() {
    if (!mergeDraft || hasUnsavedGeometryChanges) {
      return;
    }

    const mergeElementIds = Array.from(new Set(mergeDraft.elementIds)).filter((elementId) =>
      workspace.elements.some((element) => element.id === elementId && isMergeableElement(element)),
    );
    if (mergeElementIds.length < 2) {
      setMergeDraft(null);
      return;
    }

    const label = mergeDraft.label.trim() || buildUniqueElementName(DEFAULT_MERGE_LABEL, workspace.elements);
    setError(null);
    setStatus("Merging selected elements...");

    try {
      const payload = await mergeWorkspaceElements({
        elementIds: mergeElementIds,
        label,
      }, activeRunId);
      setMergeDraft(null);
      applyWorkspaceMutation(payload.state, "Merged selected elements.", payload.element.id);
      void refreshWorkspaceRuns();
    } catch (mergeError) {
      setStatus("Merge failed.");
      setError(mergeError instanceof Error ? mergeError.message : "Could not merge elements.");
    }
  }

  function cancelMergeDraft() {
    setMergeDraft(null);
    setStatus("Merge cancelled.");
  }

  async function handleApplySplit() {
    if (!selectedElement || splitRegions.length === 0) {
      return;
    }

    setError(null);
    setStatus("Splitting element...");

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/split`, activeRunId),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            regions: splitRegions.map((region) => ({
              bbox: region.bbox,
            })),
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
      setTool("select");
    } catch (splitError) {
      setStatus("Split failed.");
      setError(
        splitError instanceof Error ? splitError.message : "Could not split element.",
      );
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

  return (
    <div className="app-shell">
      <TopAppBar
        source={workspace.source}
        sourceDetails={sourceDetails}
        status={status}
        isAnnotating={isAnnotating}
        isSaving={isSavingState}
        isExporting={isExporting}
        canRunDetection={canRunDetection}
        canSave={hasUnsavedElementChanges}
        canExport={canExportAssetPack}
        detectionActionLabel={detectionActionLabel}
        detectionActionHelp={detectionActionHelp}
        runs={workspaceRuns}
        activeRunId={activeRunId}
        onUpload={handleUpload}
        onRunDetection={() => void handleRunDetection()}
        onSave={() => void handleSaveElement()}
        onExport={() => void handleExportAssetPack()}
        onSelectRun={(runId) => void handleSelectRun(runId)}
        onDeleteRun={(runId) => void handleDeleteRun(runId)}
      />

      <main className="workbench-grid-frame">
        <PanelGroup
          className="workbench-grid"
          orientation="horizontal"
        >
          <Panel className="workbench-panel workbench-panel-rail" defaultSize="16%" minSize="12%" maxSize="24%">
            <PipelineRail
              source={workspace.source}
              elements={workspace.elements}
              exportSummary={exportSummary}
            />
          </Panel>

          <PanelResizeHandle
            aria-label="Resize pipeline rail"
            className="workbench-panel-resize-handle"
          >
            <span aria-hidden="true" />
          </PanelResizeHandle>

          <Panel className="workbench-panel workbench-panel-canvas" defaultSize="57%" minSize="42%">
            <section className="canvas-workspace" aria-label="Canvas workspace">
          <CanvasToolbar
            tool={tool}
            overlays={overlays}
            hasSource={workspace.source !== null}
            canClickDetect={workspace.source !== null && !isAnnotating}
            hasSelection={selectedElement !== null}
            canSplit={selectedElement !== null}
            canMerge={canMergeSelectedElements}
            canUndo={canUndoHistory(boxEditHistory) || canUndoHistory(workspaceHistory)}
            canRedo={canRedoHistory(boxEditHistory) || canRedoHistory(workspaceHistory)}
            zoomPercent={canvasZoom}
            isPanMode={isPanMode || isSpacePanning}
            onSelectTool={handleSelectTool}
            onToggleOverlay={handleOverlayToggle}
            onEditBox={handleStartBoxEdit}
            onMerge={() => void handleMergeSelectedElements()}
            onUndo={() => void handleUndo()}
            onRedo={() => void handleRedo()}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitCanvas={handleFitCanvas}
            onTogglePanMode={handleTogglePanMode}
          />
          <CanvasStage
            sourceUrl={sourceUrl}
            source={workspace.source}
            overlays={overlays}
            overlayElements={canvasOverlayElements}
            selectedElementId={selectedElementId}
            selectedElementIds={selectedElementIds}
            editingElementId={editingElementId}
            mergePreview={mergePreview}
            sourceDetails={sourceDetails}
            tool={tool}
            draftRegion={draftRegion}
            splitRegions={splitRegions}
            missingMaskRegion={missingMaskRegion}
            assetCacheKey={assetCacheKey}
            workspaceRunId={activeRunId}
            canDrawMissingMask={canDrawMissingMask}
            hasUnsavedBoxEdit={editingElementId === selectedElement?.id && hasUnsavedGeometryChanges}
            zoomPercent={canvasZoom}
            isPanMode={isPanMode || isSpacePanning}
            panOffset={canvasPan}
            focusRequest={canvasFocusRequest}
            manualElementName={manualElementName}
            renamingElementId={renamingElementId}
            canCreateChildFromDraft={selectedElement !== null}
            onSelectElement={handleSelectElement}
            onClearSelection={handleClearSelection}
            onOpenElementContextMenu={handleOpenElementContextMenu}
            onStartRenameElement={handleStartInlineRenameElement}
            onCommitRenameElement={(elementId, name) => void handleCommitInlineRenameElement(elementId, name)}
            onCancelRenameElement={handleCancelInlineRenameElement}
            onBoxDraftChange={handleBoxDraftChange}
            onZoomByWheel={handleCanvasWheelZoom}
            onZoomByGesture={handleCanvasGestureZoom}
            onPanChange={handleCanvasPanChange}
            onDraftRegionChange={setDraftRegion}
            onAddSplitRegion={(region) => setSplitRegions((current) => [...current, region])}
            onMissingMaskRegionChange={setMissingMaskRegion}
            onCompleteMissingMaskRegion={(region) => void handleCompleteMissingMaskRegion(region)}
            onManualElementNameChange={setManualElementName}
            onCreateElement={(name) => void handleCreateElement(name)}
            onCreateChildElement={(name) => void handleCreateChildElement(name)}
            onConfirmBoxEdit={() => void handleSaveElement()}
            onCancelBoxEdit={handleCancelBoxEdit}
            onClearDrafts={clearDrafts}
            onApplySplit={() => void handleApplySplit()}
            onClickDetectPoint={(point) => void handleClickDetectPoint(point)}
          />
          {selectedSegmentElement ? (
            <FloatingStageDrawer title="Segment">
              <SegmentEdgeBoard
                element={selectedSegmentElement}
                assetCacheKey={assetCacheKey}
                workspaceRunId={activeRunId}
                isSuggesting={suggestingSegmentElementId === selectedSegmentElement.id}
                isAccepting={acceptingSegmentElementId === selectedSegmentElement.id}
                onSuggestMask={(elementId) => void handleSuggestSegmentMask(elementId)}
                onAcceptMask={(elementId) => void handleAcceptSegmentMask(elementId)}
                onPatchMask={(elementId, patch) => void handlePatchSegmentMask(elementId, patch)}
              />
            </FloatingStageDrawer>
          ) : null}
          <div className="canvas-operation-row">
            <button
              type="button"
              disabled={!canRunSelectedExtraction || isExtracting}
              onClick={() => void handleExtractSelected()}
            >
              Extract
            </button>
            <button
              type="button"
              disabled={
                !workspace.source
                || !hasBatchExtractTargets
                || isExtracting
                || hasUnsavedGeometryChanges
              }
              onClick={() => void handleExtractAllAccepted()}
            >
              Extract All
            </button>
            <button type="button" disabled>
              Repair
            </button>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          {shouldShowWorkspacePreviews ? (
            <div className="workspace-preview-panels">
              {selectedElement ? (
                <ExtractionPreview
                  selectedElement={selectedElement}
                  assetCacheKey={assetCacheKey}
                  workspaceRunId={activeRunId}
                />
              ) : null}
              <RepairComparison
                selectedElement={selectedElement}
                qaReport={selectedRepairQaReport}
                repairMetadata={selectedRepairMetadata}
                assetCacheKey={assetCacheKey}
                workspaceRunId={activeRunId}
                hasMissingMaskPreview={selectedHasMissingMask}
              />
              {exportSummary ? (
                <ExportPanel
                  summary={exportSummary}
                  assetCacheKey={assetCacheKey}
                  workspaceRunId={activeRunId}
                />
              ) : null}
            </div>
          ) : null}
            </section>
          </Panel>

          <PanelResizeHandle
            aria-label="Resize review panel"
            className="workbench-panel-resize-handle"
          >
            <span aria-hidden="true" />
          </PanelResizeHandle>

          <Panel className="workbench-panel workbench-panel-review" defaultSize="27%" minSize="20%" maxSize="40%">
            <section className="right-review-panel" aria-label="Review panel">
          {workspace.source ? (
            <DetectionVocabularyPanel
              labels={workspace.detectionVocabulary}
              disabled={isSavingVocabulary || isAnnotating}
              onSave={(labels) => void handleSaveDetectionVocabulary(labels)}
            />
          ) : null}

          <AssetTreePanel
            elements={visibleElements}
            selectedElementId={selectedElementId}
            selectedElementIds={selectedElementIds}
            workspaceRunId={activeRunId}
            assetCacheKey={assetCacheKey}
            showRejected={overlays.showRejected}
            reviewableCount={reviewableElementCount}
            onSelectElement={handleSelectElement}
            onToggleShowRejected={() => handleOverlayToggle("showRejected")}
            onToggleVisibility={(elementId) => void handleVisibilityToggle(elementId)}
            onCompleteReview={() => void handleCompleteReview()}
          />

          <InspectorPanel
            selectedElement={selectedElement}
            elements={workspace.elements}
            draft={elementDraft}
            workspaceRunId={activeRunId}
            splitRequestDescription={splitRequestDescription}
            missingMaskDraft={missingMaskDraft}
            repairQaReport={selectedRepairQaReport}
            hasMissingMaskPreview={selectedHasMissingMask}
            hasRepairPackage={selectedHasRepairPackage}
            onDraftChange={setElementDraft}
            onPatchElementRole={(elementId, patch) => void handlePatchElementRole(elementId, patch)}
            onSplitRequestDescriptionChange={setSplitRequestDescription}
            onMissingMaskDraftChange={setMissingMaskDraft}
            onSaveElement={() => void handleSaveElement()}
            onCreateSplitRequest={() => void handleCreateSplitRequest()}
            onReplaceMaskByCurrentShape={() => void handleReplaceMaskByCurrentShape()}
            onClearMask={() => void handleClearMask()}
            onReExtract={() => void handleExtractSelected()}
            onDrawMissingMask={handleStartMissingMaskDrawing}
            onSaveMissingMaskFromDraft={() => void handleSaveMissingMaskFromDraft()}
            onCreateRepairTask={() => void handleCreateRepairTask()}
            onValidateRepairOutput={() => void handleValidateRepairOutput()}
            canExtractSelected={canRunSelectedExtraction}
            hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
            isExtracting={isExtracting}
            isRepairing={isRepairing}
            assetCacheKey={assetCacheKey}
          />
            </section>
          </Panel>
        </PanelGroup>
      </main>

      <ModelStatusStrip
        elements={workspace.elements}
        status={status}
        isSaving={isSavingState}
        exportSummary={exportSummary}
      />
      {mergeDraft ? (
        <MergeAssetDialog
          elements={mergeDraftElements}
          label={mergeDraft.label}
          onLabelChange={(label) => setMergeDraft((current) => current ? { ...current, label } : current)}
          onCancel={cancelMergeDraft}
          onConfirm={() => void confirmMergeDraft()}
        />
      ) : null}
      {assetContextMenu && contextMenuElement && isActionableElement(contextMenuElement) ? (
        <AssetContextMenu
          x={assetContextMenu.x}
          y={assetContextMenu.y}
          element={contextMenuElement}
          selectedMergeElements={contextMenuMergeElements}
          canMergeSelectedElements={canMergeSelectedElements}
          isSelectedForMerge={isContextMenuElementSelectedForMerge}
          canSelectForMerge={canContextMenuElementJoinMerge}
          canMergeWithSelection={canContextMenuMergeWithSelection}
          canAccept={
            isActiveCandidate(contextMenuElement)
            && !isAcceptedStatus(contextMenuElement.status)
          }
          canReject={
            isActiveCandidate(contextMenuElement)
            && canRejectStatus(contextMenuElement.status)
          }
          hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
          onClose={closeAssetContextMenu}
          onToggleMergeSelection={handleMergeSelectionToggle}
          onMergeWithSelection={(elementId) => void handleMergeWithSelection(elementId)}
          onEditBox={handleStartBoxEdit}
          onRename={(elementId) => void handleRenameElement(elementId)}
          onAddChild={() => void handleAddChildFromSelection()}
          onSplitParent={handleStartSplitParent}
          onAccept={(elementId) => void handleAccept(elementId)}
          onReject={(elementId) => void handleReject(elementId)}
          onMerge={() => void handleMergeSelectedElements()}
        />
      ) : null}
    </div>
  );
}

function MergeAssetDialog({
  elements,
  label,
  onLabelChange,
  onCancel,
  onConfirm,
}: {
  elements: WorkspaceElement[];
  label: string;
  onLabelChange: (label: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <div className="operation-dialog-backdrop" role="presentation">
      <form
        aria-label="Name merged asset"
        aria-modal="true"
        className="operation-dialog"
        role="dialog"
        onSubmit={handleSubmit}
      >
        <div className="operation-dialog-header">
          <span>Merge assets</span>
          <strong>{elements.length} selected</strong>
        </div>
        <label className="operation-dialog-field">
          <span>Merged asset name</span>
          <input
            autoFocus
            aria-label="Merged asset name"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </label>
        <div className="operation-dialog-preview" aria-label="Assets to merge">
          {elements.slice(0, 4).map((element) => (
            <span key={element.id}>{element.label ?? element.name}</span>
          ))}
          {elements.length > 4 ? <span>+{elements.length - 4} more</span> : null}
        </div>
        <div className="operation-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-action">
            Create merged asset
          </button>
        </div>
      </form>
    </div>
  );
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
  );
}

function isSpacePanShortcut(event: globalThis.KeyboardEvent): boolean {
  return event.code === "Space" || event.key === " " || event.key === "Spacebar";
}

function canExtractElement(element: WorkspaceElement): boolean {
  if (isRejectedElement(element)) {
    return false;
  }
  return ["accepted", "extract_ready", "extracted"].includes(element.status);
}

function canBatchExtractElement(element: WorkspaceElement): boolean {
  if (isRejectedElement(element)) {
    return false;
  }
  return ["accepted", "extract_ready"].includes(element.status);
}

function isSegmentableWorkbenchElement(element: WorkspaceElement): boolean {
  if (!isActionableElement(element)) {
    return false;
  }

  return [
    "accepted",
    "extract_ready",
  ].includes(element.status);
}

function buildClickDetectLabel(
  selectedElement: WorkspaceElement | null,
  vocabulary: string[],
): string {
  const selectedLabel = selectedElement
    ? (selectedElement.label ?? selectedElement.name).trim()
    : "";
  if (selectedLabel) {
    return selectedLabel;
  }

  // WHY: click-detect 后端要求 label；优先复用当前词表，避免 UI 在没有选择时发散出另一套临时类别协议。
  return vocabulary.find((label) => label.trim().length > 0)?.trim() ?? "Sticker";
}

function isDisplayableElement(element: WorkspaceElement): boolean {
  return element.mergedInto === null;
}

function isActionableElement(element: WorkspaceElement): boolean {
  return isDisplayableElement(element) && !isRejectedElement(element);
}

function isMergeableElement(element: WorkspaceElement): boolean {
  return isActionableElement(element) && element.visible;
}

function isActiveCandidate(element: WorkspaceElement): boolean {
  return isActionableElement(element);
}

function needsElementReview(element: WorkspaceElement): boolean {
  return isActionableElement(element) && [
    "model_detected",
    "click_detected",
    "proposal",
    "edited",
    "child",
    "merged",
    "qa_failed",
  ].includes(element.status);
}

function isAcceptedStatus(status: WorkspaceElement["status"]): boolean {
  return [
    "accepted",
    "exported",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
  ].includes(status);
}

function canRejectStatus(status: WorkspaceElement["status"]): boolean {
  return ["proposal", "model_detected", "click_detected", "edited", "child", "merged"].includes(status);
}

function buildDefaultMergeLabel(
  elements: WorkspaceElement[],
  existingElements: WorkspaceElement[] = [],
): string {
  const names = elements
    .map((element) => (element.label ?? element.name).trim())
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(names));
  let baseLabel = DEFAULT_MERGE_LABEL;
  if (uniqueNames.length === 0) {
    baseLabel = DEFAULT_MERGE_LABEL;
  } else if (uniqueNames.length === 1) {
    baseLabel = `${uniqueNames[0]} group`;
  } else if (uniqueNames.length === 2) {
    baseLabel = `${uniqueNames[0]} + ${uniqueNames[1]}`;
  } else {
    baseLabel = `${uniqueNames[0]} group`;
  }

  return buildUniqueElementName(baseLabel, existingElements);
}

function buildUniqueElementName(baseLabel: string, existingElements: WorkspaceElement[]): string {
  const normalizedBaseLabel = baseLabel.trim() || DEFAULT_MERGE_LABEL;
  const existingNames = new Set(
    existingElements
      .filter(isDisplayableElement)
      .map((element) => (element.label ?? element.name).trim().toLowerCase())
      .filter(Boolean),
  );
  if (!existingNames.has(normalizedBaseLabel.toLowerCase())) {
    return normalizedBaseLabel;
  }

  let suffix = 2;
  while (existingNames.has(`${normalizedBaseLabel} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${normalizedBaseLabel} ${suffix}`;
}

function isRejectedElement(element: WorkspaceElement): boolean {
  return element.mode === "rejected" || element.status === "rejected";
}

function hasExtractedAssetPreview(element: WorkspaceElement): boolean {
  return ["extracted", "repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}

function isExportReadyElement(element: WorkspaceElement): boolean {
  if (!isActionableElement(element)) {
    return false;
  }
  // WHY: 导出资格必须以分割确认和后端 gate 为准；suggested mask 与 legacy bbox_alpha 只是预览/调试资产。
  return (
    element.segmentationStatus === "mask_accepted"
    && isRepairGateSatisfied(element)
    && isBackendExportGateSatisfied(element)
  );
}

function isRepairGateSatisfied(element: WorkspaceElement): boolean {
  if (element.repairStatus === "not_required") {
    return element.mode !== "needs_completion";
  }
  return element.repairStatus === "repair_complete";
}

function isBackendExportGateSatisfied(element: WorkspaceElement): boolean {
  return element.exportStatus === "ready" || element.exportStatus === "exported";
}

function hasRepairPackage(element: WorkspaceElement): boolean {
  return ["repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}

function shouldLoadRepairMetadata(element: WorkspaceElement): boolean {
  return (
    element.mode === "needs_completion"
    || element.mode === "completed_by_codex"
    || hasRepairPackage(element)
  );
}

function ExtractionPreview({
  selectedElement,
  assetCacheKey,
  workspaceRunId,
}: {
  selectedElement: WorkspaceElement | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
}) {
  if (!selectedElement) {
    return (
      <div className="extraction-preview extraction-preview-empty">
        <span className="preview-label">Extraction Preview</span>
        <strong>Select an element</strong>
      </div>
    );
  }

  const hasExtractedAsset = hasExtractedAssetPreview(selectedElement) && selectedElement.mask;

  return (
    <div className="extraction-preview">
      <div className="extraction-preview-summary">
        <span className="preview-label">Extraction Preview</span>
        <strong>{selectedElement.name}</strong>
        <span>{formatCanvas(selectedElement)}</span>
        <span>{formatBBox(selectedElement)}</span>
      </div>
      {hasExtractedAsset ? (
        <div className="extraction-preview-grid">
          <figure>
            <img
              alt={`${selectedElement.name} source crop`}
              src={sourceCropUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
            <figcaption>Source crop</figcaption>
          </figure>
          <figure>
            <img
              alt={`${selectedElement.name} mask overlay`}
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
            />
            <figcaption>Mask overlay</figcaption>
          </figure>
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} transparent asset`}
                src={assetIncompleteUrl(selectedElement, assetCacheKey, workspaceRunId)}
              />
            </div>
            <figcaption>Transparent asset</figcaption>
          </figure>
        </div>
      ) : selectedElement.mask ? (
        <div className="extraction-preview-grid">
          <figure>
            <img
              alt={`${selectedElement.name} mask overlay`}
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey, workspaceRunId) ?? undefined}
            />
            <figcaption>Mask overlay</figcaption>
          </figure>
          <p className="panel-copy">Mask saved. Re-extract to refresh asset previews.</p>
        </div>
      ) : (
        <p className="panel-copy">Run extraction to create mask and transparent asset previews.</p>
      )}
    </div>
  );
}

function RepairComparison({
  selectedElement,
  qaReport,
  repairMetadata,
  assetCacheKey,
  workspaceRunId,
  hasMissingMaskPreview,
}: {
  selectedElement: WorkspaceElement | null;
  qaReport: RepairQaReport | null;
  repairMetadata: RepairMetadata | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
  hasMissingMaskPreview: boolean;
}) {
  if (!selectedElement || !isRepairVisible(selectedElement, qaReport, repairMetadata)) {
    return null;
  }

  const changedOverlayUrl = repairMetadata?.files.changedPixelsOverlay && qaReport?.changedPixelsOverlayPath
    ? workspaceAssetUrl(qaReport.changedPixelsOverlayPath, assetCacheKey, workspaceRunId)
    : null;
  const hasCompletedAsset = repairMetadata?.files.completedAsset ?? false;

  return (
    <div className="repair-comparison">
      <div className="repair-comparison-summary">
        <span className="preview-label">Repair Comparison</span>
        <strong>{selectedElement.name}</strong>
        {qaReport ? (
          <>
            <span className={`qa-badge qa-${qaReport.status}`}>QA {qaReport.status}</span>
            <span>Inside missing changed pixels: {qaReport.metrics.insideMissingChangedPixels}</span>
            <span>Outside missing changed pixels: {qaReport.metrics.outsideMissingChangedPixels}</span>
            <span>Generated area ratio: {formatRatio(qaReport.metrics.changedAreaRatio)}</span>
          </>
        ) : (
          <span>QA pending</span>
        )}
      </div>
      <div className="repair-comparison-grid">
        <figure>
          <div className="checkerboard-preview">
            <img
              alt={`${selectedElement.name} before asset`}
              src={assetIncompleteUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
          </div>
          <figcaption>Before asset</figcaption>
        </figure>
        {hasCompletedAsset ? (
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} after asset`}
                src={repairAssetUrl(selectedElement, "completed_asset.png", assetCacheKey, workspaceRunId)}
              />
            </div>
            <figcaption>After asset</figcaption>
          </figure>
        ) : null}
        {hasMissingMaskPreview ? (
          <figure>
            <img
              alt={`${selectedElement.name} missing mask overlay`}
              src={missingMaskUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
            <figcaption>Missing mask overlay</figcaption>
          </figure>
        ) : null}
        {changedOverlayUrl ? (
          <figure>
            <img
              alt={`${selectedElement.name} changed pixels overlay`}
              src={changedOverlayUrl}
            />
            <figcaption>Changed pixels overlay</figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}

function isRepairVisible(
  selectedElement: WorkspaceElement,
  qaReport: RepairQaReport | null,
  repairMetadata: RepairMetadata | null,
): boolean {
  return (
    selectedElement.mode === "needs_completion"
    || selectedElement.mode === "completed_by_codex"
    || hasRepairPackage(selectedElement)
    || qaReport?.elementId === selectedElement.id
    || repairMetadata?.elementId === selectedElement.id
  );
}

function ExportPanel({
  summary,
  assetCacheKey,
  workspaceRunId,
}: {
  summary: ExportSummary | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
}) {
  return (
    <div className="export-panel">
      <div className="export-panel-summary">
        <h3>Export Pack</h3>
        <strong>{summary ? "Asset pack ready" : "No export yet"}</strong>
        {summary ? (
          <>
            <span>Manifest: {summary.paths.manifest}</span>
            <span>Level: {summary.paths.level}</span>
          </>
        ) : (
          <span>Run export after mask acceptance and repair validation.</span>
        )}
      </div>
      <div className="export-panel-details">
        {summary ? (
          <>
            <div className="export-metrics">
              <div className="preview-card">
                <span className="preview-label">Exportable count</span>
                <strong>{summary.exportableCount} exportable</strong>
              </div>
              <div className="preview-card">
                <span className="preview-label">Blocked count</span>
                <strong>{summary.blockedCount} blocked</strong>
              </div>
              <div className="preview-card export-path-card">
                <span className="preview-label">Open export folder path</span>
                <strong>{summary.outputDir}</strong>
              </div>
            </div>
            {summary.warnings.length > 0 ? (
              <div className="export-warnings">
                <span className="preview-label">Warnings</span>
                <ul>
                  {summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="panel-copy">No export warnings.</p>
            )}
            {summary.blockedElements.length > 0 ? (
              <div className="export-blocked">
                <span className="preview-label">Blocked elements</span>
                <ul>
                  {summary.blockedElements.map((blocked) => (
                    <li key={blocked.elementId}>
                      <strong>{blocked.elementId}</strong>
                      <span>{blocked.name}</span>
                      <span>{blocked.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <figure className="export-contact-sheet">
              <img
                alt="Export contact sheet preview"
                src={workspaceAssetUrl(summary.paths.contactSheet, assetCacheKey, workspaceRunId) ?? undefined}
              />
              <figcaption>Contact sheet preview</figcaption>
            </figure>
          </>
        ) : (
          <p className="panel-copy">The contact sheet preview appears here after export.</p>
        )}
      </div>
    </div>
  );
}

function formatExportStatus(summary: ExportSummary): string {
  const assetLabel = summary.exportableCount === 1 ? "asset" : "assets";
  return `Exported ${summary.exportableCount} ${assetLabel}. ${summary.blockedCount} blocked.`;
}

function formatRatio(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatCanvas(element: WorkspaceElement): string {
  return `Canvas ${element.canvas.w} x ${element.canvas.h} at ${element.canvas.x}, ${element.canvas.y}`;
}

function formatBBox(element: WorkspaceElement): string {
  return `BBox ${element.bbox.w} x ${element.bbox.h} at ${element.bbox.x}, ${element.bbox.y}`;
}

function draftFromElement(element: WorkspaceElement): ElementEditorDraft {
  return {
    name: element.name,
    mode: element.mode,
    layer: String(element.layer),
    bbox: boxToDraft(element.bbox),
    canvas: boxToDraft(element.canvas),
    notes: element.notes,
    visible: element.visible,
  };
}

function missingMaskDraftFromElement(element: WorkspaceElement): MissingMaskDraft {
  const x = clampInteger(element.bbox.x - element.canvas.x, 0, element.canvas.w);
  const y = clampInteger(element.bbox.y - element.canvas.y, 0, element.canvas.h);
  const maxWidth = Math.max(1, element.canvas.w - x);
  const maxHeight = Math.max(1, element.canvas.h - y);
  return {
    x: String(x),
    y: String(y),
    w: String(clampInteger(element.bbox.w, 1, maxWidth)),
    h: String(clampInteger(element.bbox.h, 1, maxHeight)),
  };
}

function boxToDraft(box: Box): { x: string; y: string; w: string; h: string } {
  return {
    x: String(box.x),
    y: String(box.y),
    w: String(box.w),
    h: String(box.h),
  };
}

function parseBox(box: { x: string; y: string; w: string; h: string }): Box | null {
  const x = parseWholeNumber(box.x);
  const y = parseWholeNumber(box.y);
  const w = parseWholeNumber(box.w);
  const h = parseWholeNumber(box.h);

  if (x === null || y === null || w === null || h === null) {
    return null;
  }

  return { x, y, w, h };
}

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function boxFitsInsideElementCanvas(box: Box, element: WorkspaceElement): boolean {
  return (
    box.x >= 0
    && box.y >= 0
    && box.w > 0
    && box.h > 0
    && box.x + box.w <= element.canvas.w
    && box.y + box.h <= element.canvas.h
  );
}

function isGeometryDraftDirty(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const bbox = parseBox(draft.bbox);
  const canvas = parseBox(draft.canvas);
  if (!bbox || !canvas) {
    return true;
  }

  return !boxesEqual(element.bbox, bbox) || !boxesEqual(element.canvas, canvas);
}

function isElementDraftDirty(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const nextElement = buildElementFromDraft(element, draft);
  if (!nextElement) {
    return true;
  }

  const currentLabel = element.label ?? element.name;
  const nextLabel = nextElement.label ?? nextElement.name;
  return nextElement.name !== element.name
    || nextLabel !== currentLabel
    || nextElement.mode !== element.mode
    || nextElement.layer !== element.layer
    || !boxesEqual(nextElement.bbox, element.bbox)
    || !boxesEqual(nextElement.canvas, element.canvas)
    || nextElement.notes !== element.notes
    || nextElement.visible !== element.visible;
}

function canPatchElementDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const layer = Number.parseInt(draft.layer, 10);
  const canvas = parseBox(draft.canvas);
  if (Number.isNaN(layer) || !canvas) {
    return false;
  }

  return (
    draft.mode === element.mode
    && layer === element.layer
    && boxesEqual(element.canvas, canvas)
    && draft.notes === element.notes
  );
}

function hasPatchableContentChanges(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const bbox = parseBox(draft.bbox);
  if (!bbox) {
    return false;
  }

  const nextLabel = draft.name.trim() || element.name;
  const currentLabel = element.label ?? element.name;
  return !boxesEqual(element.bbox, bbox) || nextLabel !== currentLabel;
}

function buildElementPatchFromDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): PatchWorkspaceElementRequest | null {
  const bbox = parseBox(draft.bbox);
  if (!bbox) {
    return null;
  }

  const request: PatchWorkspaceElementRequest = {};
  const nextLabel = draft.name.trim() || element.name;
  const currentLabel = element.label ?? element.name;

  if (!boxesEqual(element.bbox, bbox)) {
    request.bbox = bbox;
  }
  if (nextLabel !== currentLabel) {
    request.label = nextLabel;
  }
  if (draft.visible !== element.visible) {
    request.visible = draft.visible;
  }

  return request;
}

function boxesEqual(left: Box, right: Box): boolean {
  return (
    left.x === right.x
    && left.y === right.y
    && left.w === right.w
    && left.h === right.h
  );
}

function sourceBoxToElementCanvasBox(sourceBox: Box, element: WorkspaceElement): Box | null {
  const canvas = element.canvas;
  const left = clampInteger(sourceBox.x, canvas.x, canvas.x + canvas.w);
  const top = clampInteger(sourceBox.y, canvas.y, canvas.y + canvas.h);
  const right = clampInteger(sourceBox.x + sourceBox.w, canvas.x, canvas.x + canvas.w);
  const bottom = clampInteger(sourceBox.y + sourceBox.h, canvas.y, canvas.y + canvas.h);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left - canvas.x,
    y: top - canvas.y,
    w: right - left,
    h: bottom - top,
  };
}

function buildDefaultChildBox(parentBox: Box): Box {
  const width = Math.max(1, Math.floor(parentBox.w / 3));
  const height = Math.max(1, Math.floor(parentBox.h / 3));
  return {
    x: parentBox.x + Math.max(0, Math.floor((parentBox.w - width) / 2)),
    y: parentBox.y + Math.max(0, Math.floor((parentBox.h - height) / 2)),
    w: width,
    h: height,
  };
}

function clampBoxToSource(box: Box, source: SourceMetadata): Box {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const width = clampInteger(Math.round(box.w), 1, sourceWidth);
  const height = clampInteger(Math.round(box.h), 1, sourceHeight);

  return {
    x: clampInteger(Math.round(box.x), 0, sourceWidth - width),
    y: clampInteger(Math.round(box.y), 0, sourceHeight - height),
    w: width,
    h: height,
  };
}

function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildElementFromDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): WorkspaceElement | null {
  const layer = Number.parseInt(draft.layer, 10);
  const bbox = parseBox(draft.bbox);
  const canvas = parseBox(draft.canvas);
  if (Number.isNaN(layer) || !bbox || !canvas) {
    return null;
  }

  return {
    ...element,
    name: draft.name.trim() || element.name,
    label: draft.name.trim() || element.name,
    mode: draft.mode,
    layer,
    bbox,
    canvas,
    notes: draft.notes,
    visible: draft.visible,
  };
}
