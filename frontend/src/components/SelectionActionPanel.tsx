import { useEffect, useState } from "react";

import { WorkspaceElement } from "../workspace";

type SelectionActionPanelProps = {
  hasSource: boolean;
  isAnnotating: boolean;
  selectedElement: WorkspaceElement | null;
  selectedDraftName: string;
  selectedMergeElements: WorkspaceElement[];
  mergeCandidateCount: number;
  mergeLabel: string;
  canMergeSelectedElements: boolean;
  canSaveSelectedName: boolean;
  hasUnsavedGeometryChanges: boolean;
  onRunDetection: () => void;
  onEditBox: () => void;
  onAddChild: () => void;
  onSplitParent: () => void;
  onSaveName: (value: string) => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
  onMergeLabelChange: (value: string) => void;
  onMerge: () => void;
};

export function SelectionActionPanel({
  hasSource,
  selectedElement,
  selectedDraftName,
  selectedMergeElements,
  mergeCandidateCount,
  mergeLabel,
  canMergeSelectedElements,
  canSaveSelectedName,
  hasUnsavedGeometryChanges,
  onEditBox,
  onAddChild,
  onSplitParent,
  onSaveName,
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
            selectedDraftName={selectedDraftName}
            mergeCandidateCount={mergeCandidateCount}
            canSaveSelectedName={canSaveSelectedName}
            hasUnsavedGeometryChanges={hasUnsavedGeometryChanges}
            onEditBox={onEditBox}
            onAddChild={onAddChild}
            onSplitParent={onSplitParent}
            onSaveName={onSaveName}
            onAccept={onAccept}
            onReject={onReject}
          />
        ) : (
          <NoSelectionActions
            hasSource={hasSource}
            mergeCandidateCount={mergeCandidateCount}
          />
        )}
      </div>
    </section>
  );
}

function NoSelectionActions({
  hasSource,
  mergeCandidateCount,
}: {
  hasSource: boolean;
  mergeCandidateCount: number;
}) {
  return (
    <div className="selection-action-stack">
      <div className="selection-action-summary">
        <span className="preview-label">No asset selected</span>
        <strong>{hasSource ? "Run detection from the top bar to populate this review queue." : "Upload a PNG to begin."}</strong>
        <span className="panel-copy">Accepted assets, child splits, merge selections, and review actions appear here after detection.</span>
      </div>
      {mergeCandidateCount >= 2 ? <MergeStandby /> : null}
    </div>
  );
}

function SingleSelectionActions({
  selectedElement,
  selectedDraftName,
  mergeCandidateCount,
  canSaveSelectedName,
  hasUnsavedGeometryChanges,
  onEditBox,
  onAddChild,
  onSplitParent,
  onSaveName,
  onAccept,
  onReject,
}: {
  selectedElement: WorkspaceElement;
  selectedDraftName: string;
  mergeCandidateCount: number;
  canSaveSelectedName: boolean;
  hasUnsavedGeometryChanges: boolean;
  onEditBox: () => void;
  onAddChild: () => void;
  onSplitParent: () => void;
  onSaveName: (value: string) => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
}) {
  const isActive = isActiveCandidate(selectedElement);
  const canAccept = isActive && !isAcceptedStatus(selectedElement.status);
  const canReject = isActive && canRejectStatus(selectedElement.status);
  const [nameDraft, setNameDraft] = useState(selectedDraftName || selectedElement.name);

  useEffect(() => {
    setNameDraft(selectedDraftName || selectedElement.name);
  }, [selectedDraftName, selectedElement.id, selectedElement.name]);

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
      <div className="selection-name-editor">
        <label className="field-group">
          <span>Selected asset name</span>
          <input
            aria-label="Selected asset name"
            type="text"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!canSaveSelectedName || hasUnsavedGeometryChanges}
          onClick={() => onSaveName(nameDraft)}
        >
          Save name
        </button>
      </div>
      <div className="selection-action-grid">
        <button type="button" onClick={onEditBox}>Edit box</button>
        <button type="button" onClick={onAddChild}>Add child</button>
        <button type="button" disabled>
          Run detect inside
        </button>
        <button type="button" onClick={onSplitParent}>Split asset</button>
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
