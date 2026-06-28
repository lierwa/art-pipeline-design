import { ChangeEvent } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CircleStop,
  HelpCircle,
  Loader2,
  PackageOpen,
  Play,
  RefreshCw,
  Settings,
  Upload,
} from "lucide-react";

import { IconButton } from "../../shared/ui/IconButton";
import { ConfirmActionDialog } from "../../shared/ui/ConfirmActionDialog";
import { ProcessingRecordsPopover } from "./ProcessingRecordsPopover";
import { SourceMetadata, WorkspaceRunSummary } from "../../domain/workspace";
import { ProductNav } from "./ProductNav";

type TopAppBarProps = {
  source: SourceMetadata | null;
  status: string;
  title?: string;
  showPipelineControls?: boolean;
  primaryActionLabel?: string | null;
  primaryActionHelp?: string | null;
  isPrimaryActionRunning?: boolean;
  isPrimaryActionDisabled?: boolean;
  secondaryActionLabel?: string | null;
  secondaryActionHelp?: string | null;
  isSecondaryActionRunning?: boolean;
  isSecondaryActionDisabled?: boolean;
  canStopCodexGeneration: boolean;
  isStoppingCodexGeneration: boolean;
  runs: WorkspaceRunSummary[];
  activeRunId: string | null;
  onUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onStopCodexGeneration?: () => void | Promise<void>;
  onSelectRun?: (runId: string) => void;
  onDuplicateRun?: (runId: string) => void | Promise<void>;
  onDeleteRun?: (runId: string) => void | Promise<void>;
};

export function TopAppBar({
  source,
  status,
  title = "Art Asset Pipeline",
  showPipelineControls = true,
  primaryActionLabel = null,
  primaryActionHelp = null,
  isPrimaryActionRunning = false,
  isPrimaryActionDisabled = false,
  secondaryActionLabel = null,
  secondaryActionHelp = null,
  isSecondaryActionRunning = false,
  isSecondaryActionDisabled = false,
  canStopCodexGeneration,
  isStoppingCodexGeneration,
  runs,
  activeRunId,
  onUpload,
  onPrimaryAction,
  onSecondaryAction,
  onStopCodexGeneration,
  onSelectRun,
  onDuplicateRun,
  onDeleteRun,
}: TopAppBarProps) {
  const canShowProcessingRecords =
    showPipelineControls
    && onSelectRun
    && onDuplicateRun
    && onDeleteRun;

  return (
    <header className="top-app-bar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>{title}</h1>
          <p>{status}</p>
        </div>
        <ProductNav />
      </div>

      {showPipelineControls && onUpload ? (
        <input
          id="source-upload"
          aria-label="Upload PNG"
          accept="image/png"
          className="visually-hidden"
          type="file"
          onChange={onUpload}
        />
      ) : null}

      <Tooltip.Provider delayDuration={250}>
        <div className="top-app-actions">
          {showPipelineControls && onUpload ? (
            <label
              className="upload-button source-upload-button"
              htmlFor="source-upload"
              title={source ? `Change source: ${source.filename}` : "Upload PNG"}
            >
              <Upload size={16} strokeWidth={2.2} aria-hidden="true" />
              <span className="visually-hidden">Upload PNG</span>
            </label>
          ) : null}
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
          {primaryActionLabel && onPrimaryAction ? (
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
          ) : null}
          {showPipelineControls && canStopCodexGeneration && onStopCodexGeneration ? (
            <ConfirmActionDialog
              title="Stop Codex generation"
              description="Terminate active Codex generation processes and mark the current running Codex jobs failed. Saved source images, masks, and completed assets remain untouched."
              confirmLabel="Stop Codex generation"
              onConfirm={onStopCodexGeneration}
              trigger={(
                <button
                  type="button"
                  className="stop-codex-action"
                  aria-label={isStoppingCodexGeneration ? "Stopping Codex generation" : "Stop Codex generation"}
                  disabled={isStoppingCodexGeneration}
                  title="Stop active Codex generation processes"
                >
                  {isStoppingCodexGeneration ? (
                    <Loader2 size={15} className="is-spinning" aria-hidden="true" />
                  ) : (
                    <CircleStop size={15} aria-hidden="true" />
                  )}
                  {isStoppingCodexGeneration ? "Stopping..." : "Stop Codex"}
                </button>
              )}
            />
          ) : null}
          {canShowProcessingRecords ? (
            <ProcessingRecordsPopover
              runs={runs}
              activeRunId={activeRunId}
              onSelectRun={onSelectRun}
              onDuplicateRun={onDuplicateRun}
              onDeleteRun={onDeleteRun}
            />
          ) : null}
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
