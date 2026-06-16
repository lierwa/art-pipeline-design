import {
  assetIncompleteUrl,
  ElementEditorDraft,
  ElementMode,
  sourceCropUrl,
  WorkspaceElement,
  workspaceAssetUrl,
} from "../workspace";

type InspectorPanelProps = {
  selectedElement: WorkspaceElement | null;
  draft: ElementEditorDraft | null;
  splitRequestDescription: string;
  onDraftChange: (draft: ElementEditorDraft) => void;
  onSplitRequestDescriptionChange: (value: string) => void;
  onSaveElement: () => void;
  onCreateSplitRequest: () => void;
  onReplaceMaskByBBox: () => void;
  onClearMask: () => void;
  onReExtract: () => void;
  canExtractSelected: boolean;
  isExtracting: boolean;
};

export function InspectorPanel({
  selectedElement,
  draft,
  splitRequestDescription,
  onDraftChange,
  onSplitRequestDescriptionChange,
  onSaveElement,
  onCreateSplitRequest,
  onReplaceMaskByBBox,
  onClearMask,
  onReExtract,
  canExtractSelected,
  isExtracting,
}: InspectorPanelProps) {
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
                  onClick={onReplaceMaskByBBox}
                >
                  Replace mask by bbox
                </button>
                <button
                  type="button"
                  disabled={!selectedElement.mask}
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
              {selectedElement.mask ? (
                <div className="inspector-preview-strip">
                  <img
                    alt={`${selectedElement.name} inspector source crop`}
                    src={sourceCropUrl(selectedElement)}
                  />
                  <img
                    alt={`${selectedElement.name} inspector mask overlay`}
                    src={workspaceAssetUrl(selectedElement.mask) ?? undefined}
                  />
                  <div className="checkerboard-preview">
                    <img
                      alt={`${selectedElement.name} inspector transparent asset`}
                      src={assetIncompleteUrl(selectedElement)}
                    />
                  </div>
                </div>
              ) : (
                <p className="panel-copy">No extraction mask saved for this element.</p>
              )}
            </section>
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
