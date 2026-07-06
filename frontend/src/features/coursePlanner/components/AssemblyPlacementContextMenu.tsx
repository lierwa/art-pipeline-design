import { useEffect, useRef } from "react";

export type AssemblyPlacementContextMenuAction = {
  id: string;
  label: string;
  tone?: "danger";
  onSelect: () => void;
};

type AssemblyPlacementContextMenuProps = {
  actions: AssemblyPlacementContextMenuAction[];
  onClose: () => void;
  position: { x: number; y: number };
};

export function AssemblyPlacementContextMenu({
  actions,
  onClose,
  position,
}: AssemblyPlacementContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Placement actions"
      className="assembly-placement-context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={`assembly-placement-context-menu-item${action.tone === "danger" ? " assembly-placement-context-menu-item-danger" : ""}`}
          onClick={action.onSelect}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
