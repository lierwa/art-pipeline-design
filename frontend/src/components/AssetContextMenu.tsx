import { useEffect, useRef } from "react";

import { WorkspaceElement } from "../workspace";

type AssetContextMenuProps = {
  x: number;
  y: number;
  element: WorkspaceElement;
  selectedMergeElements: WorkspaceElement[];
  canMergeSelectedElements: boolean;
  canAccept: boolean;
  canReject: boolean;
  hasUnsavedGeometryChanges: boolean;
  onClose: () => void;
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
  canAccept,
  canReject,
  hasUnsavedGeometryChanges,
  onClose,
  onEditBox,
  onRename,
  onAddChild,
  onSplitParent,
  onAccept,
  onReject,
  onMerge,
}: AssetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMergeMenu = selectedMergeElements.length >= 2;
  const displayName = element.label ?? element.name;
  const position = constrainMenuPosition(x, y, isMergeMenu);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [displayName, isMergeMenu]);

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
      aria-label={isMergeMenu ? "Asset context menu for selection" : `Asset context menu for ${displayName}`}
      className="asset-context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="asset-context-menu-header">
        <span>{isMergeMenu ? `${selectedMergeElements.length} selected` : displayName}</span>
        {isMergeMenu ? (
          <small>{selectedMergeElements.map((selectedElement) => selectedElement.name).join(", ")}</small>
        ) : (
          <small>{element.status}</small>
        )}
      </div>

      {isMergeMenu ? (
        <button
          type="button"
          role="menuitem"
          disabled={!canMergeSelectedElements}
          onClick={() => runAction(onMerge)}
        >
          Merge into one asset
        </button>
      ) : (
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
      )}

      {hasUnsavedGeometryChanges ? (
        <p className="asset-context-menu-note">Save geometry changes before merge or export actions.</p>
      ) : null}
    </div>
  );
}

function constrainMenuPosition(x: number, y: number, isMergeMenu: boolean) {
  if (typeof window === "undefined") {
    return { left: x, top: y };
  }

  const estimatedWidth = 292;
  const estimatedHeight = isMergeMenu ? 128 : 276;
  const margin = 12;
  return {
    left: clamp(x, margin, Math.max(margin, window.innerWidth - estimatedWidth)),
    top: clamp(y, margin, Math.max(margin, window.innerHeight - estimatedHeight)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
