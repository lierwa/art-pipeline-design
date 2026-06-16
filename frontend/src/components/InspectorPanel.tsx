import { AcceptedElementDraft, ElementMode, WorkspaceElement } from "../workspace";

type InspectorPanelProps = {
  selectedElement: WorkspaceElement | null;
  acceptedDraft: AcceptedElementDraft | null;
  onAcceptedDraftChange: (draft: AcceptedElementDraft) => void;
  onSaveAcceptedElement: () => void;
};

export function InspectorPanel({
  selectedElement,
  acceptedDraft,
  onAcceptedDraftChange,
  onSaveAcceptedElement,
}: InspectorPanelProps) {
  return (
    <aside className="panel inspector-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      <div className="panel-body">
        {selectedElement?.status === "accepted" && acceptedDraft ? (
          <form
            className="inspector-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveAcceptedElement();
            }}
          >
            <label className="field-group">
              <span>Element name</span>
              <input
                aria-label="Element name"
                type="text"
                value={acceptedDraft.name}
                onChange={(event) =>
                  onAcceptedDraftChange({
                    ...acceptedDraft,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label className="field-group">
              <span>Element mode</span>
              <select
                aria-label="Element mode"
                value={acceptedDraft.mode}
                onChange={(event) =>
                  onAcceptedDraftChange({
                    ...acceptedDraft,
                    mode: event.target.value as ElementMode,
                  })
                }
              >
                <option value="visible_only">visible_only</option>
                <option value="needs_completion">needs_completion</option>
                <option value="completed_by_codex">completed_by_codex</option>
              </select>
            </label>
            <label className="field-group">
              <span>Element layer</span>
              <input
                aria-label="Element layer"
                type="number"
                value={acceptedDraft.layer}
                onChange={(event) =>
                  onAcceptedDraftChange({
                    ...acceptedDraft,
                    layer: event.target.value,
                  })
                }
              />
            </label>
            <button type="submit">Save element</button>
          </form>
        ) : selectedElement ? (
          <div className="inspector-details">
            <strong>{selectedElement.name}</strong>
            <span>Status: {selectedElement.status}</span>
            <span>Mode: {selectedElement.mode}</span>
            <span>
              BBox: {selectedElement.bbox.x}, {selectedElement.bbox.y},{" "}
              {selectedElement.bbox.w} x {selectedElement.bbox.h}
            </span>
            <span>Source: {selectedElement.source}</span>
          </div>
        ) : (
          <p className="panel-copy">Select an element to inspect its settings.</p>
        )}
      </div>
    </aside>
  );
}
