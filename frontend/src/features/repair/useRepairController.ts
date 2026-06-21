import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

import {
  boxFitsInsideElementCanvas,
  boxToDraft,
  missingMaskDraftFromElement,
  parseBox,
  sourceBoxToElementCanvasBox,
} from "../../domain/elementDraft";
import type {
  Box,
  CanvasTool,
  DraftRegion,
  MissingMaskDraft,
  RepairMetadata,
  RepairQaReport,
  WorkspaceElement,
  WorkspaceState,
} from "../../domain/workspace";
import { workspaceApiUrl } from "../../domain/workspace";
import type {
  CreateRepairTaskResponse,
  SaveMissingMaskResponse,
  ValidateRepairResponse,
} from "../../domain/workspaceApi";
import { shouldLoadRepairMetadata } from "../../domain/workspaceDerived";

type ApplyWorkspaceMutation = (
  nextState: WorkspaceState,
  nextStatus: string,
  nextSelectionId?: string | null,
) => void;

type UseRepairControllerInput = {
  activeRunId: string | null;
  applyWorkspaceMutation: ApplyWorkspaceMutation;
  refreshWorkspaceRuns: () => void;
  setCanvasTool: (tool: CanvasTool) => void;
  setDraftRegion: (region: DraftRegion | null) => void;
  setSplitRegions: Dispatch<SetStateAction<DraftRegion[]>>;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
};

export function useRepairController({
  activeRunId,
  applyWorkspaceMutation,
  refreshWorkspaceRuns,
  setCanvasTool,
  setDraftRegion,
  setSplitRegions,
  setError,
  setStatus,
}: UseRepairControllerInput) {
  const [missingMaskDraft, setMissingMaskDraft] = useState<MissingMaskDraft | null>(null);
  const [missingMaskRegion, setMissingMaskRegion] = useState<DraftRegion | null>(null);
  const [savedMissingMaskElementIds, setSavedMissingMaskElementIds] = useState<string[]>([]);
  const [repairQaReport, setRepairQaReport] = useState<RepairQaReport | null>(null);
  const [repairMetadataByElementId, setRepairMetadataByElementId] = useState<Record<string, RepairMetadata>>({});
  const [isRepairing, setIsRepairing] = useState(false);
  const missingMaskDraftsRef = useRef<Record<string, MissingMaskDraft>>({});

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

  function clearAllLocalRepairState() {
    setRepairMetadataByElementId({});
    setSavedMissingMaskElementIds([]);
    setRepairQaReport(null);
    setMissingMaskDraft(null);
    setMissingMaskRegion(null);
    missingMaskDraftsRef.current = {};
  }

  function retainRepairMetadataForElementIds(elementIds: string[]) {
    const existingIds = new Set(elementIds);
    setRepairMetadataByElementId((current) => {
      return Object.fromEntries(
        Object.entries(current).filter(([elementId]) => existingIds.has(elementId)),
      );
    });
  }

  function forgetRepairMetadata(elementId: string) {
    setRepairMetadataByElementId((current) => {
      const next = { ...current };
      delete next[elementId];
      return next;
    });
  }

  function selectRepairElement(element: WorkspaceElement | null) {
    if (!element) {
      setMissingMaskDraft(null);
      setRepairQaReport(null);
      return;
    }

    setMissingMaskDraft(
      missingMaskDraftsRef.current[element.id]
        ?? missingMaskDraftFromElement(element),
    );
    setRepairQaReport((current) =>
      current?.elementId === element.id ? current : null,
    );
  }

  function handleStartMissingMaskDrawing(canDrawMissingMask: boolean) {
    if (!canDrawMissingMask) {
      return;
    }

    setCanvasTool("missing-mask");
    setDraftRegion(null);
    setSplitRegions([]);
    setMissingMaskRegion(null);
    setStatus("Drag on the canvas to draw the missing mask.");
    setError(null);
  }

  async function handleSaveMissingMaskFromDraft(
    selectedElement: WorkspaceElement | null,
    hasUnsavedGeometryChanges: boolean,
  ) {
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

  async function handleCompleteMissingMaskRegion(
    selectedElement: WorkspaceElement | null,
    canDrawMissingMask: boolean,
    region: DraftRegion,
  ) {
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
      refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Missing mask save failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not save missing mask.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  async function handleCreateRepairTask(
    selectedElement: WorkspaceElement | null,
    hasUnsavedGeometryChanges: boolean,
  ) {
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
        { method: "POST" },
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
      refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Repair task creation failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not create Codex repair task.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  async function handleValidateRepairOutput(selectedElement: WorkspaceElement | null) {
    if (!selectedElement || isRepairing) {
      return;
    }

    setIsRepairing(true);
    setStatus("Validating repair output...");
    setError(null);

    try {
      const response = await fetch(
        workspaceApiUrl(`/api/workspace/elements/${selectedElement.id}/repair/validate`, activeRunId),
        { method: "POST" },
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
      refreshWorkspaceRuns();
    } catch (repairError) {
      setStatus("Repair validation failed.");
      setError(
        repairError instanceof Error ? repairError.message : "Could not validate repair output.",
      );
    } finally {
      setIsRepairing(false);
    }
  }

  // WHY: repair/missing-mask 是独立于画布框编辑的外部流程，集中在这里能避免 App 同时管理
  // metadata 缓存、草稿缓存和三种网络副作用；代价是 hook 需要接收少量 App 级流程回调。
  return {
    applyRepairMetadata,
    clearAllLocalRepairState,
    clearLocalRepairMetadata,
    forgetRepairMetadata,
    handleCompleteMissingMaskRegion,
    handleCreateRepairTask,
    handleSaveMissingMaskFromDraft,
    handleStartMissingMaskDrawing,
    handleValidateRepairOutput,
    isRepairing,
    missingMaskDraft,
    missingMaskRegion,
    repairMetadataByElementId,
    repairQaReport,
    selectRepairElement,
    retainRepairMetadataForElementIds,
    savedMissingMaskElementIds,
    setMissingMaskDraft,
    setMissingMaskRegion,
  };
}

type SelectedRepairMetadataLoaderInput = {
  activeRunId: string | null;
  selectedElement: WorkspaceElement | null;
  applyRepairMetadata: (metadata: RepairMetadata) => void;
  forgetRepairMetadata: (elementId: string) => void;
};

export function useSelectedRepairMetadataLoader({
  activeRunId,
  selectedElement,
  applyRepairMetadata,
  forgetRepairMetadata,
}: SelectedRepairMetadataLoaderInput) {
  useEffect(() => {
    if (!selectedElement || !shouldLoadRepairMetadata(selectedElement)) {
      return;
    }

    const elementId = selectedElement.id;
    let cancelled = false;
    async function loadMetadata() {
      try {
        const metadata = await fetchRepairMetadata(elementId, activeRunId);
        if (!cancelled) {
          applyRepairMetadata(metadata);
        }
      } catch {
        if (!cancelled) {
          forgetRepairMetadata(elementId);
        }
      }
    }

    void loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, selectedElement?.id, selectedElement?.mode, selectedElement?.status]);
}

async function fetchRepairMetadata(
  elementId: string,
  activeRunId: string | null,
): Promise<RepairMetadata> {
  const response = await fetch(
    workspaceApiUrl(`/api/workspace/elements/${elementId}/repair/metadata`, activeRunId),
  );
  if (!response.ok) {
    throw new Error("Could not load repair metadata.");
  }
  return (await response.json()) as RepairMetadata;
}
