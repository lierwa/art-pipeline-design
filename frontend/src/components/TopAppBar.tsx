import { ChangeEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle, PackageOpen, Play, Save, Settings } from "lucide-react";

import { IconButton } from "./IconButton";
import { ProcessingRecordsPopover } from "./ProcessingRecordsPopover";
import { SourceMetadata, WorkspaceRunSummary } from "../workspace";

type TopAppBarProps = {
  source: SourceMetadata | null;
  sourceDetails: string;
  status: string;
  isAnnotating: boolean;
  isSaving: boolean;
  isExporting: boolean;
  canRunDetection: boolean;
  canSave: boolean;
  canExport: boolean;
  detectionActionLabel: string;
  detectionActionHelp: string | null;
  runs: WorkspaceRunSummary[];
  activeRunId: string | null;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRunDetection: () => void;
  onSave: () => void;
  onExport: () => void;
  onSelectRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void | Promise<void>;
};

export function TopAppBar({
  source,
  sourceDetails,
  status,
  isAnnotating,
  isSaving,
  isExporting,
  canRunDetection,
  canSave,
  canExport,
  detectionActionLabel,
  detectionActionHelp,
  runs,
  activeRunId,
  onUpload,
  onRunDetection,
  onSave,
  onExport,
  onSelectRun,
  onDeleteRun,
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

      <label className="source-control" htmlFor="source-upload">
        <span>Source</span>
        <strong>{source ? source.filename : "Upload PNG"}</strong>
        <small>{source ? `${source.width} x ${source.height}` : sourceDetails}</small>
      </label>
      <input
        id="source-upload"
        aria-label="Upload PNG"
        accept="image/png"
        className="visually-hidden"
        type="file"
        onChange={onUpload}
      />

      <Tooltip.Provider delayDuration={250}>
        <div className="top-app-actions">
          <button
            type="button"
            className="primary-action"
            onClick={onRunDetection}
            disabled={!canRunDetection || isAnnotating}
            title={detectionActionHelp ?? undefined}
          >
            <Play size={16} fill="currentColor" aria-hidden="true" />
            {isAnnotating ? "Running..." : detectionActionLabel}
          </button>
          <ProcessingRecordsPopover
            runs={runs}
            activeRunId={activeRunId}
            onSelectRun={onSelectRun}
            onDeleteRun={onDeleteRun}
          />
          <IconButton
            label="Save Edit"
            icon={<Save size={16} strokeWidth={2.2} />}
            showLabel
            className="icon-button-label"
            disabled={!canSave || isSaving}
            onClick={onSave}
          />
          <IconButton
            label="Export"
            aria-label="Export Asset Pack"
            icon={<PackageOpen size={16} strokeWidth={2.2} />}
            showLabel
            className="icon-button-label"
            disabled={!canExport || isExporting}
            onClick={onExport}
          />
          <IconButton
            label="Help"
            icon={<HelpCircle size={17} strokeWidth={2.2} />}
            className="top-icon-button"
          />
          <IconButton
            label="Settings"
            icon={<Settings size={17} strokeWidth={2.2} />}
            className="top-icon-button"
          />
          <div className="user-avatar" aria-label="User profile">U</div>
        </div>
      </Tooltip.Provider>
    </header>
  );
}
