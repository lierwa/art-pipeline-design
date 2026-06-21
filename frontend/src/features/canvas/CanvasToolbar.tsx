import * as Tooltip from "@radix-ui/react-tooltip";
import { ReactNode } from "react";
import {
  BoxSelect,
  Combine,
  Crosshair,
  Hand,
  Images,
  Maximize2,
  MousePointer2,
  PenLine,
  Redo2,
  ScanLine,
  SplitSquareHorizontal,
  Tags,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { IconButton } from "../../shared/ui/IconButton";
import { CanvasTool, OverlayState } from "../../domain/workspace";

type CanvasToolbarProps = {
  tool: CanvasTool;
  overlays: OverlayState;
  hasSource: boolean;
  canClickDetect?: boolean;
  hasSelection: boolean;
  canSplit: boolean;
  canMerge: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoomPercent: number;
  isPanMode: boolean;
  onSelectTool: (tool: CanvasTool) => void;
  onToggleOverlay: (key: keyof OverlayState) => void;
  onEditBox: () => void;
  onMerge: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitCanvas: () => void;
  onTogglePanMode: () => void;
};

export function CanvasToolbar({
  tool,
  overlays,
  hasSource,
  canClickDetect = false,
  hasSelection,
  canSplit,
  canMerge,
  canUndo,
  canRedo,
  zoomPercent,
  isPanMode,
  onSelectTool,
  onToggleOverlay,
  onEditBox,
  onMerge,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFitCanvas,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const displayZoomPercent = Math.round(zoomPercent);

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
        <div className="canvas-tool-group" aria-label="Editing tools">
          <IconButton
            label="Select (Q)"
            aria-label="Select"
            icon={<MousePointer2 size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="Q"
            aria-pressed={tool === "select"}
            isActive={tool === "select"}
            onClick={() => onSelectTool("select")}
          />
          <IconButton
            label="Edit box (W)"
            aria-label="Edit box"
            icon={<BoxSelect size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="W"
            disabled={!hasSelection}
            onClick={onEditBox}
          />
          <IconButton
            label="Draw element (E)"
            aria-label="Draw element"
            icon={<PenLine size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="E"
            aria-pressed={tool === "draw"}
            isActive={tool === "draw"}
            disabled={!hasSource}
            onClick={() => onSelectTool("draw")}
          />
          <IconButton
            label="Click detect"
            aria-label="Click detect"
            icon={<Crosshair size={16} strokeWidth={2.2} />}
            aria-pressed={tool === "click-detect"}
            isActive={tool === "click-detect"}
            disabled={!hasSource || !canClickDetect}
            onClick={() => onSelectTool("click-detect")}
          />
          <IconButton
            label="Pan canvas (R / Space)"
            aria-label="Pan canvas"
            icon={<Hand size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="R Space"
            aria-pressed={isPanMode}
            isActive={isPanMode}
            disabled={!hasSource}
            onClick={onTogglePanMode}
          />
          <IconButton
            label="Split selected"
            icon={<SplitSquareHorizontal size={16} strokeWidth={2.2} />}
            aria-pressed={tool === "split"}
            isActive={tool === "split"}
            disabled={!hasSource || !canSplit}
            onClick={() => onSelectTool("split")}
          />
          <IconButton
            label="Merge"
            icon={<Combine size={16} strokeWidth={2.2} />}
            disabled={!canMerge}
            onClick={onMerge}
          />
          <IconButton
            label="Delete"
            icon={<Trash2 size={16} strokeWidth={2.2} />}
            disabled
          />
        </div>

        <div className="canvas-overlay-switches" aria-label="Overlay toggles">
          <OverlayToggle
            label="Show boxes"
            className="overlay-toggle-boxes"
            checked={overlays.showBoxes}
            icon={<ScanLine size={16} strokeWidth={2.2} />}
            onChange={() => onToggleOverlay("showBoxes")}
          />
          <OverlayToggle
            label="Show names"
            className="overlay-toggle-names"
            checked={overlays.showNames}
            icon={<Tags size={16} strokeWidth={2.2} />}
            onChange={() => onToggleOverlay("showNames")}
          />
          <OverlayToggle
            label="Show thumbnails"
            className="overlay-toggle-thumbs"
            checked={overlays.showThumbs}
            icon={<Images size={16} strokeWidth={2.2} />}
            onChange={() => onToggleOverlay("showThumbs")}
          />
          <OverlayToggle
            label="Show masks"
            className="overlay-toggle-masks"
            checked={overlays.showMasks}
            icon={<BoxSelect size={16} strokeWidth={2.2} />}
            onChange={() => onToggleOverlay("showMasks")}
          />
        </div>

        <div className="canvas-history-controls" aria-label="History controls">
          <IconButton
            label="Undo"
            icon={<Undo2 size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="Control+Z Meta+Z"
            disabled={!canUndo}
            onClick={onUndo}
          />
          <IconButton
            label="Redo"
            icon={<Redo2 size={16} strokeWidth={2.2} />}
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y"
            disabled={!canRedo}
            onClick={onRedo}
          />
        </div>

        <div className="zoom-controls" aria-label="Zoom controls">
          <IconButton
            label="Zoom out"
            icon={<ZoomOut size={16} strokeWidth={2.2} />}
            disabled={!hasSource || zoomPercent <= 40}
            onClick={onZoomOut}
          />
          <span>{displayZoomPercent}%</span>
          <IconButton
            label="Zoom in"
            icon={<ZoomIn size={16} strokeWidth={2.2} />}
            disabled={!hasSource || zoomPercent >= 200}
            onClick={onZoomIn}
          />
          <IconButton
            label="Fit to screen"
            icon={<Maximize2 size={16} strokeWidth={2.2} />}
            disabled={!hasSource}
            onClick={onFitCanvas}
          />
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function OverlayToggle({
  label,
  className,
  checked,
  icon,
  onChange,
}: {
  label: string;
  className: string;
  checked: boolean;
  icon: ReactNode;
  onChange: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <label className={`panel-checkbox overlay-toggle ${className}`}>
          <input
            aria-label={label}
            type="checkbox"
            checked={checked}
            onChange={onChange}
          />
          <span className="shared-icon-button-icon" aria-hidden="true">{icon}</span>
          <span className="visually-hidden">{label}</span>
        </label>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" side="bottom" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
