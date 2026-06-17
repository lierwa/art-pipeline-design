import { ChangeEvent } from "react";

import { SourceMetadata } from "../workspace";

type TopAppBarProps = {
  source: SourceMetadata | null;
  sourceDetails: string;
  status: string;
  isAnnotating: boolean;
  isSaving: boolean;
  isExporting: boolean;
  canSave: boolean;
  canExport: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRunDetection: () => void;
  onSave: () => void;
  onExport: () => void;
};

export function TopAppBar({
  source,
  sourceDetails,
  status,
  isAnnotating,
  isSaving,
  isExporting,
  canSave,
  canExport,
  onUpload,
  onRunDetection,
  onSave,
  onExport,
}: TopAppBarProps) {
  return (
    <header className="top-app-bar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Art Asset Pipeline</h1>
          <p>{status}</p>
        </div>
      </div>

      <div className="source-control" aria-label="Source file">
        <span>Source</span>
        <strong>{source ? source.filename : "No source loaded"}</strong>
        <small>{source ? `${source.width} x ${source.height}` : sourceDetails}</small>
      </div>

      <div className="top-app-actions">
        <label className="upload-button" htmlFor="source-upload">
          Upload PNG
        </label>
        <input
          id="source-upload"
          aria-label="Upload PNG"
          accept="image/png"
          className="visually-hidden"
          type="file"
          onChange={onUpload}
        />
        <button
          type="button"
          className="primary-action"
          onClick={onRunDetection}
          disabled={!source || isAnnotating}
        >
          Run Detection
        </button>
        <button
          type="button"
          disabled={!canSave || isSaving}
          onClick={onSave}
        >
          Save
        </button>
        <button
          type="button"
          aria-label="Export Asset Pack"
          disabled={!canExport || isExporting}
          onClick={onExport}
        >
          Export
        </button>
      </div>
    </header>
  );
}
