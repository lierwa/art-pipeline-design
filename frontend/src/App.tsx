import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { CanvasStage } from "./components/CanvasStage";
import { ElementPanel } from "./components/ElementPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import "./styles.css";
import {
  AcceptedElementDraft,
  DEFAULT_OVERLAYS,
  EMPTY_STATE,
  normalizeWorkspaceState,
  OverlayState,
  updateElement,
  WorkspaceState,
} from "./workspace";

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
            previewUrl={previewUrl}
            source={workspace.source}
            overlays={overlays}
            overlayElements={overlayElements}
            selectedElementId={selectedElementId}
            sourceDetails={sourceDetails}
            onToggleOverlay={handleOverlayToggle}
          />
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <InspectorPanel
          selectedElement={selectedElement}
          acceptedDraft={acceptedDraft}
          onAcceptedDraftChange={setAcceptedDraft}
          onSaveAcceptedElement={() => void handleAcceptedElementSave()}
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
