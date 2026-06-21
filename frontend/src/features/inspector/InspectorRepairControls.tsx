import {
  missingMaskUrl,
  type MissingMaskDraft,
  repairAssetUrl,
  type RepairQaReport,
  type WorkspaceElement,
} from "../../domain/workspace";

type InspectorRepairControlsProps = {
  assetCacheKey: number;
  hasMissingMaskPreview: boolean;
  hasRepairPackage: boolean;
  hasUnsavedGeometryChanges: boolean;
  isRepairing: boolean;
  missingMaskDraft: MissingMaskDraft | null;
  repairQaReport: RepairQaReport | null;
  selectedElement: WorkspaceElement;
  workspaceRunId: string | null;
  onCreateRepairTask: () => void;
  onDrawMissingMask: () => void;
  onMissingMaskDraftChange: (draft: MissingMaskDraft) => void;
  onSaveMissingMaskFromDraft: () => void;
  onValidateRepairOutput: () => void;
};

export function InspectorRepairControls({
  assetCacheKey,
  hasMissingMaskPreview,
  hasRepairPackage,
  hasUnsavedGeometryChanges,
  isRepairing,
  missingMaskDraft,
  repairQaReport,
  selectedElement,
  workspaceRunId,
  onCreateRepairTask,
  onDrawMissingMask,
  onMissingMaskDraftChange,
  onSaveMissingMaskFromDraft,
  onValidateRepairOutput,
}: InspectorRepairControlsProps) {
  const shouldShow =
    missingMaskDraft !== null
    && (
      selectedElement.mode === "needs_completion"
      || hasRepairPackage
      || repairQaReport?.elementId === selectedElement.id
    );
  if (!shouldShow) {
    return null;
  }

  const repairActionsDisabled =
    selectedElement.mode !== "needs_completion"
    || hasUnsavedGeometryChanges
    || isRepairing;

  return (
    <section className="inspector-repair" aria-label="Repair controls">
      <div className="inspector-details">
        <strong>Residual completion</strong>
        <span>Canvas-space missing rectangle</span>
      </div>
      <div className="field-grid">
        <label className="field-group">
          <span>Missing X</span>
          <input
            aria-label="Missing X"
            type="number"
            value={missingMaskDraft.x}
            onChange={(event) =>
              onMissingMaskDraftChange({
                ...missingMaskDraft,
                x: event.target.value,
              })
            }
          />
        </label>
        <label className="field-group">
          <span>Missing Y</span>
          <input
            aria-label="Missing Y"
            type="number"
            value={missingMaskDraft.y}
            onChange={(event) =>
              onMissingMaskDraftChange({
                ...missingMaskDraft,
                y: event.target.value,
              })
            }
          />
        </label>
        <label className="field-group">
          <span>Missing width</span>
          <input
            aria-label="Missing width"
            type="number"
            value={missingMaskDraft.w}
            onChange={(event) =>
              onMissingMaskDraftChange({
                ...missingMaskDraft,
                w: event.target.value,
              })
            }
          />
        </label>
        <label className="field-group">
          <span>Missing height</span>
          <input
            aria-label="Missing height"
            type="number"
            value={missingMaskDraft.h}
            onChange={(event) =>
              onMissingMaskDraftChange({
                ...missingMaskDraft,
                h: event.target.value,
              })
            }
          />
        </label>
      </div>
      <div className="repair-control-buttons">
        <button
          type="button"
          disabled={repairActionsDisabled}
          onClick={onDrawMissingMask}
        >
          Draw missing mask
        </button>
        <button
          type="button"
          disabled={repairActionsDisabled}
          onClick={onSaveMissingMaskFromDraft}
        >
          Save numeric missing mask
        </button>
        <button
          type="button"
          disabled={repairActionsDisabled}
          onClick={onCreateRepairTask}
        >
          Create Codex repair task
        </button>
        <button
          type="button"
          disabled={!hasRepairPackage || isRepairing}
          onClick={onValidateRepairOutput}
        >
          Validate repair output
        </button>
      </div>
      {hasUnsavedGeometryChanges || selectedElement.mode !== "needs_completion" ? (
        <p className="panel-copy">Save the needs_completion mode and geometry before repair actions.</p>
      ) : null}
      <div className="repair-preview-stack">
        {hasMissingMaskPreview ? (
          <figure>
            <img
              alt={`${selectedElement.name} inspector missing mask overlay`}
              src={missingMaskUrl(selectedElement, assetCacheKey, workspaceRunId)}
            />
            <figcaption>Missing mask overlay</figcaption>
          </figure>
        ) : null}
        <figure>
          {hasRepairPackage ? (
            <img
              alt={`${selectedElement.name} preserve mask preview`}
              src={repairAssetUrl(selectedElement, "preserve_mask.png", assetCacheKey, workspaceRunId)}
            />
          ) : (
            <div className="repair-preview-placeholder">Pending</div>
          )}
          <figcaption>Preview preserve mask</figcaption>
        </figure>
        {repairQaReport?.elementId === selectedElement.id ? (
          <div className={`qa-summary qa-${repairQaReport.status}`}>
            <strong>Latest QA: {repairQaReport.status}</strong>
            <span>Preserve changed pixels: {repairQaReport.metrics.preserveChangedPixels}</span>
            <span>Outside missing changed pixels: {repairQaReport.metrics.outsideMissingChangedPixels}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
