import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { CanvasStage } from "./components/CanvasStage";
import { ElementPanel } from "./components/ElementPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import "./styles.css";
import {
  Box,
  buildSourceUrl,
  CanvasTool,
  DEFAULT_OVERLAYS,
  DraftRegion,
  ElementEditorDraft,
  EMPTY_STATE,
  normalizeWorkspaceState,
  OverlayState,
  updateElement,
  WorkspaceElement,
  WorkspaceState,
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

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [elementDraft, setElementDraft] = useState<ElementEditorDraft | null>(null);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [draftRegion, setDraftRegion] = useState<DraftRegion | null>(null);
  const [manualElementName, setManualElementName] = useState("Manual Element");
  const [splitRegions, setSplitRegions] = useState<DraftRegion[]>([]);
  const [splitRequestDescription, setSplitRequestDescription] = useState("");

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

  useEffect(() => {
    if (!selectedElement) {
      setElementDraft(null);
      setSplitRequestDescription("");
      return;
    }

    setElementDraft(draftFromElement(selectedElement));
    setSplitRequestDescription("");
  }, [selectedElement]);

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

  async function persistWorkspace(nextState: WorkspaceState, nextStatus: string) {
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
    } catch (saveError) {
      setWorkspace(previousState);
      setSelectedElementId(previousSelection);
      setStatus("State save failed.");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save workspace state.",
      );
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
      setSplitRegions([]);
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
    }
    if (nextTool === "split") {
      setDraftRegion(null);
    }
    if (nextTool === "select") {
      setDraftRegion(null);
      setSplitRegions([]);
    }
  }

  function clearDrafts() {
    setDraftRegion(null);
    setSplitRegions([]);
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

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, selectedElement.id, () => nextElement),
    };
    await persistWorkspace(nextState, "Element details updated.");
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
          <button type="button" disabled>
            Extract
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
            canSplit={selectedElement !== null}
            onToggleOverlay={handleOverlayToggle}
            onSelectTool={handleSelectTool}
            onDraftRegionChange={setDraftRegion}
            onAddSplitRegion={(region) => setSplitRegions((current) => [...current, region])}
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
          onDraftChange={setElementDraft}
          onSplitRequestDescriptionChange={setSplitRequestDescription}
          onSaveElement={() => void handleSaveElement()}
          onCreateSplitRequest={() => void handleCreateSplitRequest()}
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
        </div>
      </section>
    </div>
  );
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

function boxToDraft(box: Box): { x: string; y: string; w: string; h: string } {
  return {
    x: String(box.x),
    y: String(box.y),
    w: String(box.w),
    h: String(box.h),
  };
}

function parseBox(box: { x: string; y: string; w: string; h: string }): Box | null {
  const x = Number.parseInt(box.x, 10);
  const y = Number.parseInt(box.y, 10);
  const w = Number.parseInt(box.w, 10);
  const h = Number.parseInt(box.h, 10);

  if ([x, y, w, h].some(Number.isNaN)) {
    return null;
  }

  return { x, y, w, h };
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
