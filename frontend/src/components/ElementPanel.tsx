import { thumbnailUrl, WorkspaceElement } from "../workspace";

type ElementPanelProps = {
  elements: WorkspaceElement[];
  selectedElementId: string | null;
  showRejected: boolean;
  onSelectElement: (elementId: string) => void;
  onToggleShowRejected: () => void;
  onToggleVisibility: (elementId: string) => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
};

export function ElementPanel({
  elements,
  selectedElementId,
  showRejected,
  onSelectElement,
  onToggleShowRejected,
  onToggleVisibility,
  onAccept,
  onReject,
}: ElementPanelProps) {
  return (
    <aside className="panel element-panel">
      <div className="panel-header">
        <h2>Elements</h2>
        <span>{elements.length}</span>
      </div>
      <div className="panel-toolbar">
        <label className="panel-checkbox">
          <input
            aria-label="Show rejected"
            type="checkbox"
            checked={showRejected}
            onChange={onToggleShowRejected}
          />
          <span>Show rejected</span>
        </label>
      </div>
      <div className="panel-body panel-scroll">
        {elements.length > 0 ? (
          <div className="element-list">
            {elements.map((element) => {
              const isSelected = element.id === selectedElementId;
              const canReject = element.status === "proposal" && element.mode !== "rejected";

              return (
                <article
                  key={element.id}
                  className={`element-card${isSelected ? " is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="element-card-main"
                    onClick={() => onSelectElement(element.id)}
                  >
                    {element.thumbnail ? (
                      <img
                        alt={`${element.name} thumbnail`}
                        className="element-thumb"
                        src={thumbnailUrl(element.thumbnail) ?? undefined}
                      />
                    ) : (
                      <div className="element-thumb element-thumb-empty">No thumb</div>
                    )}
                    <div className="element-meta">
                      <strong>{element.name}</strong>
                      <span>{element.id}</span>
                      <span>{element.status}</span>
                      <span>{element.source}</span>
                    </div>
                  </button>
                  <div className="element-actions">
                    <label className="toggle-switch">
                      <input
                        aria-label={`Toggle visibility for ${element.name}`}
                        type="checkbox"
                        checked={element.visible}
                        onChange={() => onToggleVisibility(element.id)}
                      />
                      <span>{element.visible ? "Visible" : "Hidden"}</span>
                    </label>
                    <div className="element-action-buttons">
                      <button type="button" onClick={() => onAccept(element.id)}>
                        Accept
                      </button>
                      {canReject ? (
                        <button type="button" onClick={() => onReject(element.id)}>
                          Reject
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="panel-copy">No elements yet. Upload a scene to begin.</p>
        )}
      </div>
    </aside>
  );
}
