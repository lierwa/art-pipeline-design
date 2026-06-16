import { ChangeEvent, useEffect, useMemo, useState } from "react";

import "./styles.css";

type SourceMetadata = {
  filename: string;
  path: string;
  width: number;
  height: number;
};

type WorkspaceState = {
  source: SourceMetadata | null;
  elements: Array<Record<string, unknown>>;
};

const EMPTY_STATE: WorkspaceState = {
  source: null,
  elements: [],
};

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(EMPTY_STATE);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);

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

      const nextState = (await response.json()) as WorkspaceState;
      setWorkspace(nextState);
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
          <button type="button" disabled>
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
            <span>{workspace.elements.length}</span>
          </div>
          <div className="panel-body">
            <p className="panel-copy">No elements yet. Upload a scene to begin.</p>
          </div>
        </aside>

        <section className="canvas-panel" data-testid="canvas-area">
          <div className="canvas-header">
            <h2>Canvas</h2>
            <span>{sourceDetails}</span>
          </div>
          <div className="canvas-stage">
            {previewUrl ? (
              <img
                alt="Uploaded source"
                className="canvas-image"
                src={previewUrl}
              />
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
            <p className="panel-copy">Select an element to inspect its settings.</p>
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
            <strong>{status}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
