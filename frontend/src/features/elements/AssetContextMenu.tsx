import { useEffect, useRef } from "react";

import { WorkspaceElement } from "../../domain/workspace";

type AssetContextMenuProps = {
  x: number;
  y: number;
  element: WorkspaceElement;
  selectedMergeElements: WorkspaceElement[];
  canMergeSelectedElements: boolean;
  isSelectedForMerge: boolean;
  canSelectForMerge: boolean;
  canMergeWithSelection: boolean;
  canAccept: boolean;
  canReject: boolean;
  hasUnsavedGeometryChanges: boolean;
  onClose: () => void;
  onToggleMergeSelection: (elementId: string) => void;
  onMergeWithSelection: (elementId: string) => void;
  onEditBox: () => void;
  onRename: (elementId: string) => void;
  onAddChild: () => void;
  onSplitParent: () => void;
  onAccept: (elementId: string) => void;
  onReject: (elementId: string) => void;
  onMerge: () => void;
};

export function AssetContextMenu({
  x,
  y,
  element,
  selectedMergeElements,
  canMergeSelectedElements,
  isSelectedForMerge,
  canSelectForMerge,
  canMergeWithSelection,
  canAccept,
  canReject,
  hasUnsavedGeometryChanges,
  onClose,
  onToggleMergeSelection,
  onMergeWithSelection,
  onEditBox,
  onRename,
  onAddChild,
  onSplitParent,
  onAccept,
  onReject,
  onMerge,
}: AssetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasMultiSelection = selectedMergeElements.length >= 2;
  const canRemoveFromSelection = canSelectForMerge && isSelectedForMerge && hasMultiSelection;
  const hasMergeActions = hasMultiSelection || canMergeWithSelection || canRemoveFromSelection;
  const displayName = element.label ?? element.name;
  const position = constrainMenuPosition(x, y, hasMergeActions);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [displayName, hasMergeActions]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function runAction(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      ref={menuRef}
      aria-label={`Asset context menu for ${displayName}`}
      className="asset-context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="asset-context-menu-header">
        <span>{displayName}</span>
        <small>{formatStatusLabel(element.status)}</small>
      </div>

      {hasMergeActions ? (
        <>
          {hasMultiSelection ? (
            <button
              type="button"
              role="menuitem"
              disabled={!canMergeSelectedElements}
              onClick={() => runAction(onMerge)}
            >
              Merge selected
            </button>
          ) : null}
          {canMergeWithSelection ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onMergeWithSelection(element.id))}
            >
              Merge with selected
            </button>
          ) : null}
          {canRemoveFromSelection ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onToggleMergeSelection(element.id))}
            >
              Remove from selection
            </button>
          ) : null}
          <div className="asset-context-menu-separator" role="separator" />
        </>
      ) : null}

      <>
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(onEditBox)}
        >
          Edit box
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={hasUnsavedGeometryChanges}
          onClick={() => runAction(() => onRename(element.id))}
        >
          Rename...
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(onAddChild)}
        >
          Add child
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(onSplitParent)}
        >
          Split asset
        </button>
        {(canAccept || canReject) ? <div className="asset-context-menu-separator" role="separator" /> : null}
        {canAccept ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onAccept(element.id))}
          >
            Accept
          </button>
        ) : null}
        {canReject ? (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onReject(element.id))}
          >
            Reject
          </button>
        ) : null}
      </>

      {hasUnsavedGeometryChanges ? (
        <p className="asset-context-menu-note">Save geometry changes before merge or export actions.</p>
      ) : null}
    </div>
  );
}

function constrainMenuPosition(x: number, y: number, hasMergeActions: boolean) {
  if (typeof window === "undefined") {
    return { left: x, top: y };
  }

  const estimatedWidth = 292;
  const estimatedHeight = hasMergeActions ? 344 : 276;
  const margin = 12;
  return {
    left: clamp(x, margin, Math.max(margin, window.innerWidth - estimatedWidth)),
    top: clamp(y, margin, Math.max(margin, window.innerHeight - estimatedHeight)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatStatusLabel(status: WorkspaceElement["status"]): string {
  if (["accepted", "exported", "extract_ready", "extracted", "repair_complete"].includes(status)) {
    return "Accepted";
  }
  if (status === "rejected") {
    return "Rejected";
  }
  if (status === "edited") {
    return "Edited";
  }
  if (status === "child") {
    return "Child";
  }
  if (status === "merged") {
    return "Merged";
  }
  if (status === "split_parent") {
    return "Split source";
  }
  if (status === "repair_pending") {
    return "Repairing";
  }
  if (status === "qa_failed") {
    return "Needs fix";
  }
  return "Needs review";
}
