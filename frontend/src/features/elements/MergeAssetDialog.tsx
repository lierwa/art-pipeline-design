import { type FormEvent } from "react";

import type { WorkspaceElement } from "../../domain/workspace";

type MergeAssetDialogProps = {
  elements: WorkspaceElement[];
  label: string;
  onLabelChange: (label: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MergeAssetDialog({
  elements,
  label,
  onLabelChange,
  onCancel,
  onConfirm,
}: MergeAssetDialogProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm();
  }

  return (
    <div className="operation-dialog-backdrop" role="presentation">
      <form
        aria-label="Name merged asset"
        aria-modal="true"
        className="operation-dialog"
        role="dialog"
        onSubmit={handleSubmit}
      >
        <div className="operation-dialog-header">
          <span>Merge assets</span>
          <strong>{elements.length} selected</strong>
        </div>
        <label className="operation-dialog-field">
          <span>Merged asset name</span>
          <input
            autoFocus
            aria-label="Merged asset name"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </label>
        <div className="operation-dialog-preview" aria-label="Assets to merge">
          {elements.slice(0, 4).map((element) => (
            <span key={element.id}>{element.label ?? element.name}</span>
          ))}
          {elements.length > 4 ? <span>+{elements.length - 4} more</span> : null}
        </div>
        <div className="operation-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-action">
            Create merged asset
          </button>
        </div>
      </form>
    </div>
  );
}
