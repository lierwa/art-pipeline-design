import { ChangeEvent, CSSProperties, useEffect, useMemo, useState } from "react";

import "./styles.css";

type SourceMetadata = {
  filename: string;
  path: string;
  width: number;
  height: number;
};

type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ElementStatus =
  | "proposal"
  | "accepted"
  | "split_parent"
  | "extract_ready"
  | "extracted"
  | "repair_pending"
  | "repair_complete"
  | "qa_failed"
  | "exported";

type ElementMode =
  | "visible_only"
  | "needs_completion"
  | "completed_by_codex"
  | "rejected";

type WorkspaceElement = {
  id: string;
  name: string;
  status: ElementStatus;
  mode: ElementMode;
  bbox: Box;
  canvas: Box;
  layer: number;
  thumbnail: string | null;
  mask: string | null;
  parentId: string | null;
  source: string;
  notes: string;
  visible: boolean;
  confidence?: number | null;
};

type WorkspaceState = {
  source: SourceMetadata | null;
  elements: WorkspaceElement[];
};

type OverlayState = {
  showBoxes: boolean;
  showNames: boolean;
  showThumbs: boolean;
  showMasks: boolean;
  showRejected: boolean;
};

type AcceptedElementDraft = {
  name: string;
  mode: ElementMode;
  layer: string;
};

const EMPTY_STATE: WorkspaceState = {
  source: null,
  elements: [],
};

const DEFAULT_OVERLAYS: OverlayState = {
  showBoxes: true,
  showNames: true,
  showThumbs: true,
  showMasks: false,
  showRejected: false,
};

function thumbnailUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  return `/api/workspace/assets/${path}`;
}

function normalizeWorkspaceState(payload: WorkspaceState): WorkspaceState {
  return {
    source: payload.source,
    elements: payload.elements.map((element) => ({
      ...element,
      visible: element.visible ?? true,
      notes: element.notes ?? "",
      mode: element.mode ?? "visible_only",
      status: element.status ?? "proposal",
      thumbnail: element.thumbnail ?? null,
      mask: element.mask ?? null,
      parentId: element.parentId ?? null,
      confidence: element.confidence ?? null,
    })),
  };
}

function updateElement(
  elements: WorkspaceElement[],
  elementId: string,
  updater: (element: WorkspaceElement) => WorkspaceElement,
): WorkspaceElement[] {
  return elements.map((element) => (element.id === elementId ? updater(element) : element));
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [isSavingState, setIsSavingState] = useState(false);
  const [acceptedDraft, setAcceptedDraft] = useState<AcceptedElementDraft | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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
    if (!selectedElement || selectedElement.status !== "accepted") {
      setAcceptedDraft(null);
      return;
    }

    setAcceptedDraft({
      name: selectedElement.name,
      mode: selectedElement.mode,
      layer: String(selectedElement.layer),
    });
  }, [selectedElement]);

  async function persistWorkspace(nextState: WorkspaceState, nextStatus: string) {
    const previousState = workspace;
    setWorkspace(nextState);
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
      setWorkspace(persistedState);
      setStatus(nextStatus);
    } catch (saveError) {
      setWorkspace(previousState);
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

    const nextPreviewUrl = URL.createObjectURL(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(nextPreviewUrl);
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

      const nextState = normalizeWorkspaceState((await response.json()) as WorkspaceState);
      setWorkspace(nextState);
      setSelectedElementId(null);
      setStatus("Source image uploaded.");
    } catch (uploadError) {
      URL.revokeObjectURL(nextPreviewUrl);
      setPreviewUrl(null);
      setWorkspace(EMPTY_STATE);
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
      setWorkspace(nextState);
      setSelectedElementId(nextState.elements[0]?.id ?? null);
      setStatus(`Generated ${nextState.elements.length} annotation proposals.`);
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

  async function handleAcceptedElementSave() {
    if (!selectedElement || selectedElement.status !== "accepted" || !acceptedDraft) {
      return;
    }

    const parsedLayer = Number.parseInt(acceptedDraft.layer, 10);
    if (Number.isNaN(parsedLayer)) {
      setError("Element layer must be a whole number.");
      setStatus("State save failed.");
      return;
    }

    const nextState = {
      ...workspace,
      elements: updateElement(workspace.elements, selectedElement.id, (element) => ({
        ...element,
        name: acceptedDraft.name.trim() || element.name,
        mode: acceptedDraft.mode,
        layer: parsedLayer,
      })),
    };
    await persistWorkspace(nextState, "Element details updated.");
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
        <aside className="panel element-panel">
          <div className="panel-header">
            <h2>Elements</h2>
            <span>{visibleElements.length}</span>
          </div>
          <div className="panel-toolbar">
            <label className="panel-checkbox">
              <input
                type="checkbox"
                checked={overlays.showRejected}
                onChange={() => handleOverlayToggle("showRejected")}
              />
              <span>Show rejected</span>
            </label>
          </div>
          <div className="panel-body panel-scroll">
            {visibleElements.length > 0 ? (
              <div className="element-list">
                {visibleElements.map((element) => {
                  const isSelected = element.id === selectedElementId;
                  return (
                    <article
                      key={element.id}
                      className={`element-card${isSelected ? " is-selected" : ""}`}
                    >
                      <button
                        type="button"
                        className="element-card-main"
                        onClick={() => setSelectedElementId(element.id)}
                      >
                        {element.thumbnail ? (
                          <img
                            alt={`${element.name} thumbnail`}
                            className="element-thumb"
                            src={thumbnailUrl(element.thumbnail) ?? undefined}
                          />
                        ) : (
                          <div className="element-thumb element-thumb-empty">No thumb</div>
                        )}
                        <div className="element-meta">
                          <strong>{element.name}</strong>
                          <span>{element.id}</span>
                          <span>{element.status}</span>
                          <span>{element.source}</span>
                        </div>
                      </button>
                      <div className="element-actions">
                        <label className="toggle-switch">
                          <input
                            aria-label={`Toggle visibility for ${element.name}`}
                            type="checkbox"
                            checked={element.visible}
                            onChange={() => void handleVisibilityToggle(element.id)}
                          />
                          <span>{element.visible ? "Visible" : "Hidden"}</span>
                        </label>
                        <div className="element-action-buttons">
                          <button type="button" onClick={() => void handleAccept(element.id)}>
                            Accept
                          </button>
                          <button type="button" onClick={() => void handleReject(element.id)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="panel-copy">No elements yet. Upload a scene to begin.</p>
            )}
          </div>
        </aside>

        <section className="canvas-panel" data-testid="canvas-area">
          <div className="canvas-header">
            <h2>Canvas</h2>
            <span>{sourceDetails}</span>
          </div>
          <div className="canvas-toolbar">
            <label className="panel-checkbox">
              <input
                aria-label="Show boxes"
                type="checkbox"
                checked={overlays.showBoxes}
                onChange={() => handleOverlayToggle("showBoxes")}
              />
              <span>Show boxes</span>
            </label>
            <label className="panel-checkbox">
              <input
                aria-label="Show names"
                type="checkbox"
                checked={overlays.showNames}
                onChange={() => handleOverlayToggle("showNames")}
              />
              <span>Show names</span>
            </label>
            <label className="panel-checkbox">
              <input
                aria-label="Show thumbnails and selection"
                type="checkbox"
                checked={overlays.showThumbs}
                onChange={() => handleOverlayToggle("showThumbs")}
              />
              <span>Show thumbnails/selection</span>
            </label>
            <label className="panel-checkbox">
              <input
                aria-label="Show masks"
                type="checkbox"
                checked={overlays.showMasks}
                onChange={() => handleOverlayToggle("showMasks")}
              />
              <span>Show masks</span>
            </label>
          </div>
          <div className="canvas-stage">
            {previewUrl && workspace.source ? (
              <div
                className="canvas-artboard"
                style={{
                  aspectRatio: `${workspace.source.width} / ${workspace.source.height}`,
                }}
              >
                <img
                  alt="Uploaded source"
                  className="canvas-image"
                  src={previewUrl}
                />
                <div className="canvas-overlay-layer" aria-hidden="true">
                  {overlayElements.map((element) => {
                    const overlayStyle: CSSProperties = {
                      left: `${(element.bbox.x / workspace.source.width) * 100}%`,
                      top: `${(element.bbox.y / workspace.source.height) * 100}%`,
                      width: `${(element.bbox.w / workspace.source.width) * 100}%`,
                      height: `${(element.bbox.h / workspace.source.height) * 100}%`,
                    };
                    const isSelected = selectedElementId === element.id;

                    return (
                      <div
                        key={element.id}
                        className={`overlay-item${isSelected ? " is-selected" : ""}`}
                        style={overlayStyle}
                      >
                        {overlays.showBoxes ? (
                          <div
                            data-testid={`overlay-box-${element.id}`}
                            className="overlay-box"
                          />
                        ) : null}
                        {overlays.showNames ? (
                          <div
                            data-testid={`overlay-label-${element.id}`}
                            className="overlay-label"
                          >
                            {element.name}
                          </div>
                        ) : null}
                        {overlays.showThumbs && isSelected && element.thumbnail ? (
                          <img
                            alt=""
                            className="overlay-thumb"
                            src={thumbnailUrl(element.thumbnail) ?? undefined}
                          />
                        ) : null}
                        {overlays.showMasks ? (
                          <div className="overlay-mask-placeholder">No mask</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="canvas-empty">
                <p>Upload a PNG to populate the workbench canvas.</p>
              </div>
            )}
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-header">
            <h2>Inspector</h2>
          </div>
          <div className="panel-body">
            {selectedElement?.status === "accepted" && acceptedDraft ? (
              <form
                className="inspector-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAcceptedElementSave();
                }}
              >
                <label className="field-group">
                  <span>Element name</span>
                  <input
                    aria-label="Element name"
                    type="text"
                    value={acceptedDraft.name}
                    onChange={(event) =>
                      setAcceptedDraft((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label className="field-group">
                  <span>Element mode</span>
                  <select
                    aria-label="Element mode"
                    value={acceptedDraft.mode}
                    onChange={(event) =>
                      setAcceptedDraft((current) =>
                        current
                          ? { ...current, mode: event.target.value as ElementMode }
                          : current,
                      )
                    }
                  >
                    <option value="visible_only">visible_only</option>
                    <option value="needs_completion">needs_completion</option>
                    <option value="completed_by_codex">completed_by_codex</option>
                  </select>
                </label>
                <label className="field-group">
                  <span>Element layer</span>
                  <input
                    aria-label="Element layer"
                    type="number"
                    value={acceptedDraft.layer}
                    onChange={(event) =>
                      setAcceptedDraft((current) =>
                        current ? { ...current, layer: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <button type="submit">Save element</button>
              </form>
            ) : selectedElement ? (
              <div className="inspector-details">
                <strong>{selectedElement.name}</strong>
                <span>Status: {selectedElement.status}</span>
                <span>Mode: {selectedElement.mode}</span>
                <span>
                  BBox: {selectedElement.bbox.x}, {selectedElement.bbox.y},{" "}
                  {selectedElement.bbox.w} x {selectedElement.bbox.h}
                </span>
                <span>Source: {selectedElement.source}</span>
              </div>
            ) : (
              <p className="panel-copy">Select an element to inspect its settings.</p>
            )}
          </div>
        </aside>
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
