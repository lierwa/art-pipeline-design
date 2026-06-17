import { WorkspaceElement } from "../workspace";

type SelectionActionPanelProps = {
  hasSource: boolean;
  isAnnotating: boolean;
  selectedElement: WorkspaceElement | null;
  selectedMergeElements: WorkspaceElement[];
  mergeCandidateCount: number;
  mergeLabel: string;
  canMergeSelectedElements: boolean;
  hasUnsavedGeometryChanges: boolean;
  onRunDetection: () => void;
  onEditBox: () => void;
  onAddChild: () => void;
  onSplitParent: () => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
  onMergeLabelChange: (value: string) => void;
  onMerge: () => void;
};

export function SelectionActionPanel({
  hasSource,
  isAnnotating,
  selectedElement,
  selectedMergeElements,
  mergeCandidateCount,
  mergeLabel,
  canMergeSelectedElements,
  hasUnsavedGeometryChanges,
  onRunDetection,
  onEditBox,
  onAddChild,
  onSplitParent,
  onAccept,
  onReject,
  onMergeLabelChange,
  onMerge,
}: SelectionActionPanelProps) {
  const hasMultiSelection = selectedMergeElements.length >= 2;

  return (
    <section className="panel selection-action-panel" aria-label="Selection actions">
      <div className="panel-header">
        <h2>Actions</h2>
      </div>
      <div className="panel-body">
        {hasMultiSelection ? (
          <MultiSelectionActions
            selectedMergeElements={selectedMergeElements}
            mergeLabel={mergeLabel}
            canMergeSelectedElements={canMergeSelectedElements}
            hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
            onMergeLabelChange={onMergeLabelChange}
            onMerge={onMerge}
          />
        ) : selectedElement ? (
          <SingleSelectionActions
            selectedElement={selectedElement}
            mergeCandidateCount={mergeCandidateCount}
            onEditBox={onEditBox}
            onAddChild={onAddChild}
            onSplitParent={onSplitParent}
            onAccept={onAccept}
            onReject={onReject}
          />
        ) : (
          <NoSelectionActions
            hasSource={hasSource}
            isAnnotating={isAnnotating}
            mergeCandidateCount={mergeCandidateCount}
            onRunDetection={onRunDetection}
          />
        )}
      </div>
    </section>
  );
}

function NoSelectionActions({
  hasSource,
  isAnnotating,
  mergeCandidateCount,
  onRunDetection,
}: {
  hasSource: boolean;
  isAnnotating: boolean;
  mergeCandidateCount: number;
  onRunDetection: () => void;
}) {
  return (
    <div className="selection-action-stack">
      <div className="selection-action-summary">
        <span className="preview-label">No asset selected</span>
        <strong>Run detection or select an asset to review.</strong>
      </div>
      <button
        type="button"
        className="primary-action"
        disabled={!hasSource || isAnnotating}
        onClick={onRunDetection}
      >
        Run Detection
      </button>
      {mergeCandidateCount >= 2 ? <MergeStandby /> : null}
    </div>
  );
}

function SingleSelectionActions({
  selectedElement,
  mergeCandidateCount,
  onEditBox,
  onAddChild,
  onSplitParent,
  onAccept,
  onReject,
}: {
  selectedElement: WorkspaceElement;
  mergeCandidateCount: number;
  onEditBox: () => void;
  onAddChild: () => void;
  onSplitParent: () => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
}) {
  const isActive = isActiveCandidate(selectedElement);
  const canAccept = isActive && !isAcceptedStatus(selectedElement.status);
  const canReject = isActive && canRejectStatus(selectedElement.status);

  if (!isActive) {
    return (
      <div className="selection-action-stack">
        <div className="selection-action-summary">
          <span className="preview-label">Display only</span>
          <strong>{selectedElement.name}</strong>
          <span className="panel-copy">Rejected or merged assets are shown for review only.</span>
        </div>
        {mergeCandidateCount >= 2 ? <MergeStandby /> : null}
      </div>
    );
  }

  return (
    <div className="selection-action-stack">
      <div className="selection-action-summary">
        <span className="preview-label">Actions for "{selectedElement.name}"</span>
        <strong>Ready for review</strong>
      </div>
      <div className="selection-action-grid">
        <button type="button" onClick={onEditBox}>Edit box</button>
        <button type="button" onClick={onAddChild}>Add child</button>
        <button
          type="button"
          disabled
          aria-describedby="run-detect-inside-note"
        >
          Run detect inside
        </button>
        <button type="button" onClick={onSplitParent}>Split parent</button>
        {canAccept ? (
          <button type="button" onClick={() => onAccept(selectedElement.id)}>
            Accept
          </button>
        ) : null}
        {canReject ? (
          <button type="button" onClick={() => onReject(selectedElement.id)}>
            Reject
          </button>
        ) : null}
      </div>
      <p id="run-detect-inside-note" className="panel-copy">
        Run detect inside is not wired to a backend endpoint yet.
      </p>
      {mergeCandidateCount >= 2 ? <MergeStandby /> : null}
    </div>
  );
}

function MultiSelectionActions({
  selectedMergeElements,
  mergeLabel,
  canMergeSelectedElements,
  hasUnsavedGeometryChanges,
  onMergeLabelChange,
  onMerge,
}: {
  selectedMergeElements: WorkspaceElement[];
  mergeLabel: string;
  canMergeSelectedElements: boolean;
  hasUnsavedGeometryChanges: boolean;
  onMergeLabelChange: (value: string) => void;
  onMerge: () => void;
}) {
  return (
    <div className="selection-action-stack">
      <div className="selection-action-summary">
        <span className="preview-label">Merge selection</span>
        <strong>{selectedMergeElements.length} selected</strong>
      </div>
      <div className="selection-chip-list" aria-label="Selected assets">
        {selectedMergeElements.map((element) => (
          <span key={element.id} className="selection-chip">{element.name}</span>
        ))}
      </div>
      <label className="field-group">
        <span>Merge label</span>
        <input
          aria-label="Merge label"
          type="text"
          value={mergeLabel}
          onChange={(event) => onMergeLabelChange(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="selection-merge-button"
        aria-label="Merge selected; Merge into one asset"
        disabled={!canMergeSelectedElements}
        onClick={onMerge}
      >
        Merge into one asset
      </button>
      {hasUnsavedGeometryChanges ? (
        <p className="panel-copy">Save geometry changes before merging selected assets.</p>
      ) : null}
    </div>
  );
}

function MergeStandby() {
  return (
    <div className="selection-merge-standby">
      <button
        type="button"
        aria-label="Merge selected; Merge into one asset"
        disabled
      >
        Merge into one asset
      </button>
    </div>
  );
}

function isActiveCandidate(element: WorkspaceElement): boolean {
  return element.mergedInto === null && element.mode !== "rejected" && element.status !== "rejected";
}

function isAcceptedStatus(status: WorkspaceElement["status"]): boolean {
  return [
    "accepted",
    "exported",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
  ].includes(status);
}

function canRejectStatus(status: WorkspaceElement["status"]): boolean {
  return ["proposal", "model_detected", "edited", "child", "merged"].includes(status);
}
