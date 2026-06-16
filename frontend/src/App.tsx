import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { CanvasStage } from "./components/CanvasStage";
import { ElementPanel } from "./components/ElementPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import "./styles.css";
import {
  assetIncompleteUrl,
  Box,
  buildSourceUrl,
  CanvasTool,
  DEFAULT_OVERLAYS,
  DraftRegion,
  ElementEditorDraft,
  EMPTY_STATE,
  missingMaskUrl,
  MissingMaskDraft,
  normalizeWorkspaceState,
  OverlayState,
  repairAssetUrl,
  RepairMetadata,
  RepairQaReport,
  sourceCropUrl,
  updateElement,
  WorkspaceElement,
  WorkspaceState,
  workspaceAssetUrl,
} from "./workspace";

type CreateElementResponse = {
  element: WorkspaceElement;
  state: WorkspaceState;
};

type SplitElementResponse = {
  children: WorkspaceElement[];
  state: WorkspaceState;
};

type SplitRequestResponse = {
  requestId: string;
  path: string;
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

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [elementDraft, setElementDraft] = useState<ElementEditorDraft | null>(null);
  const [assetCacheKey, setAssetCacheKey] = useState(0);
  const [tool, setTool] = useState<CanvasTool>("select");
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
      return buildSourceUrl(Date.now());
    });
  }, [workspace.source]);

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
      if (element.mode === "rejected" && !overlays.showRejected) {
        return false;
      }
      return true;
    });
  }, [overlays.showRejected, workspace.elements]);

  const overlayElements = useMemo(() => {
    return visibleElements.filter((element) => element.visible);
  }, [visibleElements]);

  const selectedElement = useMemo(() => {
    return workspace.elements.find((element) => element.id === selectedElementId) ?? null;
  }, [selectedElementId, workspace.elements]);

  const canExtractSelected = useMemo(() => {
    return selectedElement !== null && canExtractElement(selectedElement);
  }, [selectedElement]);

  const hasUnsavedGeometryChanges = useMemo(() => {
    return selectedElement !== null && elementDraft !== null
      ? isGeometryDraftDirty(selectedElement, elementDraft)
      : false;
  }, [elementDraft, selectedElement]);

  const canRunSelectedExtraction = canExtractSelected && !hasUnsavedGeometryChanges;
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

  const hasBatchExtractTargets = useMemo(() => {
    return workspace.elements.some(
      (element) =>
        (element.status === "accepted" || element.status === "extract_ready") &&
        element.mode !== "rejected",
    );
  }, [workspace.elements]);

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
  }, [selectedElement]);

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
    const response = await fetch(`/api/workspace/elements/${elementId}/repair/metadata`);
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
      const response = await fetch("/api/workspace/state");
      if (!response.ok) {
        throw new Error("Could not load workspace state.");
      }

      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      setWorkspace(nextState);
      setSelectedElementId(nextState.elements[0]?.id ?? null);
      setStatus(nextState.source ? "Workspace loaded." : "Ready");
    } catch (loadError) {
      setStatus("Workspace load failed.");
      setError(
        loadError instanceof Error ? loadError.message : "Could not load workspace state.",
      );
    }
  }

  function replaceWorkspace(nextState: WorkspaceState, nextStatus: string, nextSelectionId?: string | null) {
    const normalized = normalizeWorkspaceState(nextState);
    setWorkspace(normalized);
    setRepairMetadataByElementId((current) => {
      const existingIds = new Set(normalized.elements.map((element) => element.id));
      return Object.fromEntries(
        Object.entries(current).filter(([elementId]) => existingIds.has(elementId)),
      );
    });
    setAssetCacheKey((current) => current + 1);
    setSelectedElementId((current) => {
      if (nextSelectionId !== undefined) {
        return nextSelectionId;
      }
      if (current && normalized.elements.some((element) => element.id === current)) {
        return current;
      }
      return normalized.elements[0]?.id ?? null;
    });
    setStatus(nextStatus);
  }

  async function persistWorkspace(nextState: WorkspaceState, nextStatus: string): Promise<boolean> {
    const previousState = workspace;
    const previousSelection = selectedElementId;
    replaceWorkspace(nextState, nextStatus);
    setIsSavingState(true);
    setError(null);

    try {
      const response = await fetch("/api/workspace/state", {
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
      replaceWorkspace(persistedState, nextStatus, previousSelection);
      return true;
    } catch (saveError) {
      setWorkspace(previousState);
      setSelectedElementId(previousSelection);
      setStatus("State save failed.");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save workspace state.",
      );
      return false;
    } finally {
      setIsSavingState(false);
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
      const response = await fetch("/api/workspace/source", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Upload failed.");
      }

      URL.revokeObjectURL(optimisticUrl);
      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      replaceWorkspace(nextState, "Source image uploaded.", null);
      setSourceUrl(buildSourceUrl(Date.now()));
      setTool("select");
      setDraftRegion(null);
      setMissingMaskRegion(null);
      setSplitRegions([]);
      setSavedMissingMaskElementIds([]);
      setRepairQaReport(null);
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

  async function handleAutoAnnotate() {
    if (!workspace.source || isAnnotating) {
      return;
    }

    setIsAnnotating(true);
    setStatus("Generating annotation proposals...");
    setError(null);

    try {
      const response = await fetch("/api/workspace/auto-annotate", {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Auto annotate failed.");
      }

      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      replaceWorkspace(
        nextState,
        `Generated ${nextState.elements.length} annotation proposals.`,
        nextState.elements[0]?.id ?? null,
      );
    } catch (annotateError) {
      setStatus("Auto annotate failed.");
      setError(
        annotateError instanceof Error ? annotateError.message : "Auto annotate failed.",
      );
    } finally {
      setIsAnnotating(false);
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
      const response = await fetch("/api/workspace/extract", {
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
      replaceWorkspace(
        payload.state,
        options.successStatus(payload.extractions.length),
        options.selectionId,
      );
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
      const response = await fetch(`/api/workspace/elements/${selectedElement.id}/mask/clear`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not clear mask.");
      }

      const payload = (await response.json()) as ClearMaskResponse;
      clearLocalRepairMetadata([selectedElement.id]);
      replaceWorkspace(payload.state, "Mask cleared.", selectedElement.id);
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
      const response = await fetch(`/api/workspace/elements/${selectedElement.id}/mask/replace`, {
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
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not replace mask.");
      }

      const payload = (await response.json()) as ReplaceMaskResponse;
      clearLocalRepairMetadata([selectedElement.id]);
      replaceWorkspace(payload.state, "Mask replaced.", selectedElement.id);
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
        `/api/workspace/elements/${element.id}/repair/missing-mask`,
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
      replaceWorkspace(payload.state, "Missing mask saved.", element.id);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
      setMissingMaskDraft(savedDraft);
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
      const response = await fetch(`/api/workspace/elements/${selectedElement.id}/repair/task`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not create Codex repair task.");
      }

      const payload = (await response.json()) as CreateRepairTaskResponse;
      setSavedMissingMaskElementIds((current) =>
        current.includes(selectedElement.id) ? current : [...current, selectedElement.id],
      );
      replaceWorkspace(payload.state, "Codex repair task created.", selectedElement.id);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
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
      const response = await fetch(`/api/workspace/elements/${selectedElement.id}/repair/validate`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not validate repair output.");
      }

      const payload = (await response.json()) as ValidateRepairResponse;
      replaceWorkspace(payload.state, `Repair validation: ${payload.qa.status}.`, selectedElement.id);
      setRepairQaReport(payload.qa);
      if (payload.repair) {
        applyRepairMetadata(payload.repair);
      }
    } catch (repairError) {
      setStatus("Repair validation failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not validate repair output.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  function handleOverlayToggle(key: keyof OverlayState) {
    setOverlays((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function handleSelectTool(nextTool: CanvasTool) {
    setTool(nextTool);
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

  function clearDrafts() {
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
  }

  async function handleAccept(elementId: string) {
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
    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, elementId, (element) => ({
        ...element,
        status: "proposal",
        mode: "rejected",
        visible: false,
      })),
    };
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
    await persistWorkspace(nextState, "Element rejected.");
  }

  async function handleVisibilityToggle(elementId: string) {
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
    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, selectedElement.id, () => nextElement),
    };
    const saved = await persistWorkspace(nextState, "Element details updated.");
    if (saved && geometryChanged) {
      clearLocalRepairMetadata([selectedElement.id]);
    }
  }

  async function handleCreateElement() {
    if (!workspace.source || !draftRegion) {
      return;
    }

    setError(null);
    setStatus("Creating manual element...");

    try {
      const response = await fetch("/api/workspace/elements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: manualElementName.trim() || "Manual Element",
          bbox: draftRegion.bbox,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not create element.");
      }

      const payload = (await response.json()) as CreateElementResponse;
      replaceWorkspace(payload.state, "Manual element created.", payload.element.id);
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

  async function handleApplySplit() {
    if (!selectedElement || splitRegions.length === 0) {
      return;
    }

    setError(null);
    setStatus("Splitting element...");

    try {
      const response = await fetch(`/api/workspace/elements/${selectedElement.id}/split`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          regions: splitRegions.map((region) => ({
            bbox: region.bbox,
          })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Could not split element.");
      }

      const payload = (await response.json()) as SplitElementResponse;
      replaceWorkspace(payload.state, `Split created ${payload.children.length} child elements.`);
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
      const response = await fetch("/api/workspace/split-requests", {
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
      <header className="top-toolbar">
        <div className="toolbar-title">
          <h1>Art Pipeline Workbench</h1>
          <p>{status}</p>
        </div>
        <div className="toolbar-actions">
          <label className="upload-button" htmlFor="source-upload">
            Upload PNG
          </label>
          <input
            id="source-upload"
            aria-label="Upload PNG"
            accept="image/png"
            className="visually-hidden"
            type="file"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={handleAutoAnnotate}
            disabled={!workspace.source || isAnnotating}
          >
            Auto Annotate
          </button>
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
          <button type="button" disabled>
            Export
          </button>
        </div>
      </header>

      <main className="workbench-grid">
        <ElementPanel
          elements={visibleElements}
          selectedElementId={selectedElementId}
          showRejected={overlays.showRejected}
          onSelectElement={setSelectedElementId}
          onToggleShowRejected={() => handleOverlayToggle("showRejected")}
          onToggleVisibility={(elementId) => void handleVisibilityToggle(elementId)}
          onAccept={(elementId) => void handleAccept(elementId)}
          onReject={(elementId) => void handleReject(elementId)}
        />

        <div>
          <CanvasStage
            sourceUrl={sourceUrl}
            source={workspace.source}
            overlays={overlays}
            overlayElements={overlayElements}
            selectedElementId={selectedElementId}
            sourceDetails={sourceDetails}
            tool={tool}
            draftRegion={draftRegion}
            splitRegions={splitRegions}
            missingMaskRegion={missingMaskRegion}
            assetCacheKey={assetCacheKey}
            canSplit={selectedElement !== null}
            canDrawMissingMask={canDrawMissingMask}
            onToggleOverlay={handleOverlayToggle}
            onSelectTool={handleSelectTool}
            onDraftRegionChange={setDraftRegion}
            onAddSplitRegion={(region) => setSplitRegions((current) => [...current, region])}
            onMissingMaskRegionChange={setMissingMaskRegion}
            onCompleteMissingMaskRegion={(region) => void handleCompleteMissingMaskRegion(region)}
            onClearDrafts={clearDrafts}
            onApplySplit={() => void handleApplySplit()}
          />
          {draftRegion ? (
            <div className="manual-create-panel">
              <label className="field-group">
                <span>New element name</span>
                <input
                  aria-label="New element name"
                  type="text"
                  value={manualElementName}
                  onChange={(event) => setManualElementName(event.target.value)}
                />
              </label>
              <button type="button" onClick={() => void handleCreateElement()}>
                Create element
              </button>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <InspectorPanel
          selectedElement={selectedElement}
          draft={elementDraft}
          splitRequestDescription={splitRequestDescription}
          missingMaskDraft={missingMaskDraft}
          repairQaReport={selectedRepairQaReport}
          hasMissingMaskPreview={selectedHasMissingMask}
          hasRepairPackage={selectedHasRepairPackage}
          onDraftChange={setElementDraft}
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
      </main>

      <section className="bottom-panel">
        <div className="panel-header">
          <h2>Preview Panel</h2>
        </div>
        <div className="bottom-panel-body">
          <div className="preview-card">
            <span className="preview-label">Source</span>
            <strong>{workspace.source ? workspace.source.filename : "Waiting for upload"}</strong>
          </div>
          <div className="preview-card">
            <span className="preview-label">Elements</span>
            <strong>{workspace.elements.length}</strong>
          </div>
          <div className="preview-card">
            <span className="preview-label">State</span>
            <strong>{isSavingState ? "Saving..." : status}</strong>
          </div>
          <ExtractionPreview selectedElement={selectedElement} assetCacheKey={assetCacheKey} />
          <RepairComparison
            selectedElement={selectedElement}
            qaReport={selectedRepairQaReport}
            repairMetadata={selectedRepairMetadata}
            assetCacheKey={assetCacheKey}
            hasMissingMaskPreview={selectedHasMissingMask}
          />
        </div>
      </section>
    </div>
  );
}

function canExtractElement(element: WorkspaceElement): boolean {
  if (element.mode === "rejected") {
    return false;
  }
  return ["accepted", "extract_ready", "extracted"].includes(element.status);
}

function hasExtractedAssetPreview(element: WorkspaceElement): boolean {
  return ["extracted", "repair_pending", "repair_complete", "qa_failed"].includes(element.status);
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
}: {
  selectedElement: WorkspaceElement | null;
  assetCacheKey: number;
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
              src={sourceCropUrl(selectedElement, assetCacheKey)}
            />
            <figcaption>Source crop</figcaption>
          </figure>
          <figure>
            <img
              alt={`${selectedElement.name} mask overlay`}
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey) ?? undefined}
            />
            <figcaption>Mask overlay</figcaption>
          </figure>
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} transparent asset`}
                src={assetIncompleteUrl(selectedElement, assetCacheKey)}
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
              src={workspaceAssetUrl(selectedElement.mask, assetCacheKey) ?? undefined}
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
  hasMissingMaskPreview,
}: {
  selectedElement: WorkspaceElement | null;
  qaReport: RepairQaReport | null;
  repairMetadata: RepairMetadata | null;
  assetCacheKey: number;
  hasMissingMaskPreview: boolean;
}) {
  if (!selectedElement || !isRepairVisible(selectedElement, qaReport, repairMetadata)) {
    return null;
  }

  const changedOverlayUrl = repairMetadata?.files.changedPixelsOverlay && qaReport?.changedPixelsOverlayPath
    ? workspaceAssetUrl(qaReport.changedPixelsOverlayPath, assetCacheKey)
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
              src={assetIncompleteUrl(selectedElement, assetCacheKey)}
            />
          </div>
          <figcaption>Before asset</figcaption>
        </figure>
        {hasCompletedAsset ? (
          <figure>
            <div className="checkerboard-preview">
              <img
                alt={`${selectedElement.name} after asset`}
                src={repairAssetUrl(selectedElement, "completed_asset.png", assetCacheKey)}
              />
            </div>
            <figcaption>After asset</figcaption>
          </figure>
        ) : null}
        {hasMissingMaskPreview ? (
          <figure>
            <img
              alt={`${selectedElement.name} missing mask overlay`}
              src={missingMaskUrl(selectedElement, assetCacheKey)}
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

function clampInteger(value: number, min: number, max: number): number {
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
    mode: draft.mode,
    layer,
    bbox,
    canvas,
    notes: draft.notes,
    visible: draft.visible,
  };
}
