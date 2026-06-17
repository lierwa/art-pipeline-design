import { CanvasTool, OverlayState } from "../workspace";

type CanvasToolbarProps = {
  tool: CanvasTool;
  overlays: OverlayState;
  hasSource: boolean;
  hasSelection: boolean;
  canSplit: boolean;
  canMerge: boolean;
  onSelectTool: (tool: CanvasTool) => void;
  onToggleOverlay: (key: keyof OverlayState) => void;
  onMerge: () => void;
};

export function CanvasToolbar({
  tool,
  overlays,
  hasSource,
  hasSelection,
  canSplit,
  canMerge,
  onSelectTool,
  onToggleOverlay,
  onMerge,
}: CanvasToolbarProps) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="canvas-tool-group" aria-label="Editing tools">
        <button
          type="button"
          className={tool === "select" ? "is-active" : ""}
          onClick={() => onSelectTool("select")}
        >
          Select
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={() => onSelectTool("select")}
        >
          Edit box
        </button>
        <button
          type="button"
          aria-label="Draw element"
          className={tool === "draw" ? "is-active" : ""}
          disabled={!hasSource}
          onClick={() => onSelectTool("draw")}
        >
          Draw
        </button>
        <button
          type="button"
          aria-label="Split selected"
          className={tool === "split" ? "is-active" : ""}
          disabled={!hasSource || !canSplit}
          onClick={() => onSelectTool("split")}
        >
          Split
        </button>
        <button
          type="button"
          disabled={!canMerge}
          onClick={onMerge}
        >
          Merge
        </button>
        <button type="button" disabled={!hasSelection}>
          Delete
        </button>
      </div>

      <div className="canvas-overlay-switches">
        <label className="panel-checkbox">
          <input
            aria-label="Show boxes"
            type="checkbox"
            checked={overlays.showBoxes}
            onChange={() => onToggleOverlay("showBoxes")}
          />
          <span>Boxes</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show names"
            type="checkbox"
            checked={overlays.showNames}
            onChange={() => onToggleOverlay("showNames")}
          />
          <span>Names</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show thumbnails and selection"
            type="checkbox"
            checked={overlays.showThumbs}
            onChange={() => onToggleOverlay("showThumbs")}
          />
          <span>Thumbs</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show masks"
            type="checkbox"
            checked={overlays.showMasks}
            onChange={() => onToggleOverlay("showMasks")}
          />
          <span>Masks</span>
        </label>
      </div>

      <div className="zoom-controls" aria-label="Zoom controls">
        <button type="button" disabled aria-label="Zoom out">-</button>
        <span>100%</span>
        <button type="button" disabled aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
