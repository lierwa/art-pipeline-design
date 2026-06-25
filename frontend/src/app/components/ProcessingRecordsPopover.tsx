import { useEffect, useRef, useState } from "react";
import { CopyPlus, History, Trash2, X } from "lucide-react";

import { IconButton } from "../../shared/ui/IconButton";
import { ConfirmActionDialog } from "../../shared/ui/ConfirmActionDialog";
import { WorkspaceRunSummary } from "../../domain/workspace";

type ProcessingRecordsPopoverProps = {
  runs: WorkspaceRunSummary[];
  activeRunId: string | null;
  onSelectRun: (runId: string) => void;
  onDuplicateRun: (runId: string) => void | Promise<void>;
  onDeleteRun: (runId: string) => void | Promise<void>;
};

export function ProcessingRecordsPopover({
  runs,
  activeRunId,
  onSelectRun,
  onDuplicateRun,
  onDeleteRun,
}: ProcessingRecordsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-confirm-dialog]")) {
        return;
      }
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function handleSelectRun(runId: string) {
    setIsOpen(false);
    onSelectRun(runId);
  }

  return (
    <div className="processing-records-popover" ref={containerRef}>
      <IconButton
        label="Processing records"
        icon={<History size={17} strokeWidth={2.2} />}
        className="top-icon-button records-trigger"
        isActive={isOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      />
      <span className="records-trigger-count" aria-hidden="true">{runs.length}</span>

      {isOpen ? (
        <section
          className="records-popover-panel"
          role="dialog"
          aria-labelledby="processing-records-title"
        >
          <div className="records-popover-header">
            <div>
              <h2 id="processing-records-title">Processing records</h2>
              <span>{runs.length === 1 ? "1 record" : `${runs.length} records`}</span>
            </div>
            <IconButton
              label="Close processing records"
              icon={<X size={16} strokeWidth={2.2} />}
              className="top-icon-button records-close-button"
              onClick={() => setIsOpen(false)}
            />
          </div>

          {runs.length > 0 ? (
            <div className="records-popover-list">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className={`record-popover-item${run.id === activeRunId ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="record-open-button"
                    aria-label={`Open ${run.title} processing record`}
                    onClick={() => handleSelectRun(run.id)}
                  >
                    <strong>{run.title}</strong>
                    <span>{formatRunMeta(run)}</span>
                  </button>
                  <button
                    type="button"
                    className="record-action-button record-duplicate-button"
                    aria-label={`Duplicate ${run.title} processing record`}
                    title="Duplicate processing record"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDuplicateRun(run.id);
                    }}
                  >
                    <CopyPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <ConfirmActionDialog
                    title="Delete processing record"
                    description="Delete this processing record and its files. This removes the saved source, state, masks, assets, and snapshots for this record."
                    confirmLabel="Delete record"
                    onConfirm={() => onDeleteRun(run.id)}
                    trigger={(
                      <button
                        type="button"
                        className="record-action-button record-delete-button"
                        aria-label={`Delete ${run.title} processing record`}
                        title="Delete processing record"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    )}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="records-popover-empty">No processing records.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function formatRunMeta(run: WorkspaceRunSummary): string {
  const countLabel = run.elementCount === 1 ? "1 element" : `${run.elementCount} elements`;
  return `${run.status} · ${countLabel}`;
}
