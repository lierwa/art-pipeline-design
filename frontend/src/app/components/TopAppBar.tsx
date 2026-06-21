import { ChangeEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle, Loader2, PackageOpen, Play, RefreshCw, Settings, Upload } from "lucide-react";

import { IconButton } from "../../shared/ui/IconButton";
import { ProcessingRecordsPopover } from "./ProcessingRecordsPopover";
import { SourceMetadata, WorkspaceRunSummary } from "../../domain/workspace";

type TopAppBarProps = {
  source: SourceMetadata | null;
  status: string;
  primaryActionLabel: string;
  primaryActionHelp: string | null;
  isPrimaryActionRunning: boolean;
  isPrimaryActionDisabled: boolean;
  secondaryActionLabel?: string | null;
  secondaryActionHelp?: string | null;
  isSecondaryActionRunning?: boolean;
  isSecondaryActionDisabled?: boolean;
  runs: WorkspaceRunSummary[];
  activeRunId: string | null;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  onSelectRun: (runId: string) => void;
  onDeleteRun: (runId: string) => void | Promise<void>;
};

export function TopAppBar({
  source,
  status,
  primaryActionLabel,
  primaryActionHelp,
  isPrimaryActionRunning,
  isPrimaryActionDisabled,
  secondaryActionLabel = null,
  secondaryActionHelp = null,
  isSecondaryActionRunning = false,
  isSecondaryActionDisabled = false,
  runs,
  activeRunId,
  onUpload,
  onPrimaryAction,
  onSecondaryAction,
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
          <label
            className="upload-button source-upload-button"
            htmlFor="source-upload"
            title={source ? `Change source: ${source.filename}` : "Upload PNG"}
          >
            <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
            <span className="visually-hidden">Upload PNG</span>
          </label>
          {secondaryActionLabel ? (
            <button
              type="button"
              className="secondary-action"
              onClick={onSecondaryAction}
              disabled={isSecondaryActionDisabled || isSecondaryActionRunning}
              title={secondaryActionHelp ?? undefined}
            >
              {isSecondaryActionRunning ? (
                <Loader2 size={15} className="is-spinning" aria-hidden="true" />
              ) : secondaryActionLabel === "Download Pack" ? (
                <PackageOpen size={15} aria-hidden="true" />
              ) : (
                <RefreshCw size={15} aria-hidden="true" />
              )}
              {isSecondaryActionRunning ? "Working..." : secondaryActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="primary-action"
            onClick={onPrimaryAction}
            disabled={isPrimaryActionDisabled || isPrimaryActionRunning}
            title={primaryActionHelp ?? undefined}
          >
            {isPrimaryActionRunning ? (
              <Loader2 size={16} className="is-spinning" aria-hidden="true" />
            ) : (
              <Play size={16} fill="currentColor" aria-hidden="true" />
            )}
            {isPrimaryActionRunning ? "Working..." : primaryActionLabel}
          </button>
          <ProcessingRecordsPopover
            runs={runs}
            activeRunId={activeRunId}
            onSelectRun={onSelectRun}
            onDeleteRun={onDeleteRun}
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
