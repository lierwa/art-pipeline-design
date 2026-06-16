import {
  assetIncompleteUrl,
  ElementEditorDraft,
  ElementMode,
  missingMaskUrl,
  MissingMaskDraft,
  repairAssetUrl,
  RepairQaReport,
  sourceCropUrl,
  WorkspaceElement,
  workspaceAssetUrl,
} from "../workspace";

type InspectorPanelProps = {
  selectedElement: WorkspaceElement | null;
  draft: ElementEditorDraft | null;
  splitRequestDescription: string;
  missingMaskDraft: MissingMaskDraft | null;
  repairQaReport: RepairQaReport | null;
  hasMissingMaskPreview: boolean;
  hasRepairPackage: boolean;
  onDraftChange: (draft: ElementEditorDraft) => void;
  onSplitRequestDescriptionChange: (value: string) => void;
  onMissingMaskDraftChange: (draft: MissingMaskDraft) => void;
  onSaveElement: () => void;
  onCreateSplitRequest: () => void;
  onReplaceMaskByCurrentShape: () => void;
  onClearMask: () => void;
  onReExtract: () => void;
  onDrawMissingMask: () => void;
  onCreateRepairTask: () => void;
  onValidateRepairOutput: () => void;
  canExtractSelected: boolean;
  hasUnsavedGeometryChanges: boolean;
  isExtracting: boolean;
  isRepairing: boolean;
  assetCacheKey: number;
};

export function InspectorPanel({
  selectedElement,
  draft,
  splitRequestDescription,
  missingMaskDraft,
  repairQaReport,
  hasMissingMaskPreview,
  hasRepairPackage,
  onDraftChange,
  onSplitRequestDescriptionChange,
  onMissingMaskDraftChange,
  onSaveElement,
  onCreateSplitRequest,
  onReplaceMaskByCurrentShape,
  onClearMask,
  onReExtract,
  onDrawMissingMask,
  onCreateRepairTask,
  onValidateRepairOutput,
  canExtractSelected,
  hasUnsavedGeometryChanges,
  isExtracting,
  isRepairing,
  assetCacheKey,
}: InspectorPanelProps) {
  const showRepairControls =
    selectedElement !== null
    && draft !== null
    && (
      draft.mode === "needs_completion"
      || selectedElement.mode === "needs_completion"
      || hasRepairPackage
      || repairQaReport?.elementId === selectedElement.id
    );
  const repairActionsDisabled =
    !selectedElement
    || selectedElement.mode !== "needs_completion"
    || hasUnsavedGeometryChanges
    || isRepairing;

  return (
    <aside className="panel inspector-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      <div className="panel-body">
        {selectedElement && draft ? (
          <form
            className="inspector-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveElement();
            }}
          >
            <label className="field-group">
              <span>Element name</span>
              <input
                aria-label="Element name"
                type="text"
                value={draft.name}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-group">
              <span>Element mode</span>
              <select
                aria-label="Element mode"
                value={draft.mode}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    mode: event.target.value as ElementMode,
                  })
                }
              >
                <option value="visible_only">visible_only</option>
                <option value="needs_completion">needs_completion</option>
                <option value="completed_by_codex">completed_by_codex</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label className="field-group">
              <span>Element layer</span>
              <input
                aria-label="Element layer"
                type="number"
                value={draft.layer}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    layer: event.target.value,
                  })
                }
              />
            </label>
            <div className="field-grid">
              <label className="field-group">
                <span>BBox X</span>
                <input
                  aria-label="BBox X"
                  type="number"
                  value={draft.bbox.x}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, x: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox Y</span>
                <input
                  aria-label="BBox Y"
                  type="number"
                  value={draft.bbox.y}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, y: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox width</span>
                <input
                  aria-label="BBox width"
                  type="number"
                  value={draft.bbox.w}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, w: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>BBox height</span>
                <input
                  aria-label="BBox height"
                  type="number"
                  value={draft.bbox.h}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      bbox: { ...draft.bbox, h: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field-group">
                <span>Canvas X</span>
                <input
                  aria-label="Canvas X"
                  type="number"
                  value={draft.canvas.x}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, x: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas Y</span>
                <input
                  aria-label="Canvas Y"
                  type="number"
                  value={draft.canvas.y}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, y: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas width</span>
                <input
                  aria-label="Canvas width"
                  type="number"
                  value={draft.canvas.w}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, w: event.target.value },
                    })
                  }
                />
              </label>
              <label className="field-group">
                <span>Canvas height</span>
                <input
                  aria-label="Canvas height"
                  type="number"
                  value={draft.canvas.h}
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      canvas: { ...draft.canvas, h: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <label className="field-group">
              <span>Element notes</span>
              <textarea
                aria-label="Element notes"
                value={draft.notes}
                onChange={(event) =>
                  onDraftChange({
                    ...draft,
                    notes: event.target.value,
                  })
                }
              />
            </label>
            <label className="panel-checkbox">
              <input
                aria-label="Element visible"
                type="checkbox"
                checked={draft.visible}
                onChange={() =>
                  onDraftChange({
                    ...draft,
                    visible: !draft.visible,
                  })
                }
              />
              <span>Element visible</span>
            </label>
            <button type="submit">Save element</button>
            <section className="inspector-extraction" aria-label="Extraction controls">
              <div className="inspector-details">
                <strong>Extraction</strong>
                <span>{formatCanvas(selectedElement)}</span>
                <span>{formatBBox(selectedElement)}</span>
              </div>
              <div className="mask-control-buttons">
                <button
                  type="button"
                  disabled={!canExtractSelected || isExtracting}
                  onClick={onReplaceMaskByCurrentShape}
                >
                  Replace mask by current shape
                </button>
                <button
                  type="button"
                  disabled={!selectedElement.mask || hasUnsavedGeometryChanges}
                  onClick={onClearMask}
                >
                  Clear mask
                </button>
                <button
                  type="button"
                  disabled={!canExtractSelected || isExtracting}
                  onClick={onReExtract}
                >
                  Re-extract
                </button>
              </div>
              {hasUnsavedGeometryChanges ? (
                <p className="panel-copy">Save geometry changes before mask or extraction actions.</p>
              ) : null}
              {hasAssetPreview(selectedElement) && selectedElement.mask ? (
                <div className="inspector-preview-strip">
                  <img
                    alt={`${selectedElement.name} inspector source crop`}
                    src={sourceCropUrl(selectedElement, assetCacheKey)}
                  />
                  <img
                    alt={`${selectedElement.name} inspector mask overlay`}
                    src={workspaceAssetUrl(selectedElement.mask, assetCacheKey) ?? undefined}
                  />
                  <div className="checkerboard-preview">
                    <img
                      alt={`${selectedElement.name} inspector transparent asset`}
                      src={assetIncompleteUrl(selectedElement, assetCacheKey)}
                    />
                  </div>
                </div>
              ) : selectedElement.mask ? (
                <div className="inspector-preview-strip">
                  <img
                    alt={`${selectedElement.name} inspector mask overlay`}
                    src={workspaceAssetUrl(selectedElement.mask, assetCacheKey) ?? undefined}
                  />
                  <p className="panel-copy">Mask saved. Re-extract to refresh asset previews.</p>
                </div>
              ) : (
                <p className="panel-copy">No extraction mask saved for this element.</p>
              )}
            </section>
            {showRepairControls && missingMaskDraft ? (
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
                        src={missingMaskUrl(selectedElement, assetCacheKey)}
                      />
                      <figcaption>Missing mask overlay</figcaption>
                    </figure>
                  ) : null}
                  <figure>
                    {hasRepairPackage ? (
                      <img
                        alt={`${selectedElement.name} preserve mask preview`}
                        src={repairAssetUrl(selectedElement, "preserve_mask.png", assetCacheKey)}
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
            ) : null}
            <label className="field-group">
              <span>Split selected element into</span>
              <input
                aria-label="Split selected element into"
                type="text"
                value={splitRequestDescription}
                onChange={(event) => onSplitRequestDescriptionChange(event.target.value)}
              />
            </label>
            <button type="button" onClick={onCreateSplitRequest}>
              Create split request
            </button>
          </form>
        ) : (
          <p className="panel-copy">Select an element to inspect its settings.</p>
        )}
      </div>
    </aside>
  );
}

function formatCanvas(element: WorkspaceElement): string {
  return `Canvas ${element.canvas.w} x ${element.canvas.h} at ${element.canvas.x}, ${element.canvas.y}`;
}

function formatBBox(element: WorkspaceElement): string {
  return `BBox ${element.bbox.w} x ${element.bbox.h} at ${element.bbox.x}, ${element.bbox.y}`;
}

function hasAssetPreview(element: WorkspaceElement): boolean {
  return ["extracted", "repair_pending", "repair_complete", "qa_failed"].includes(element.status);
}
