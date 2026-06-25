import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type WheelEvent,
} from "react";
import {
  Brush,
  Eraser,
  Maximize2,
  Minus,
  Move,
  Plus,
  Sparkles,
  WandSparkles,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import type { Box } from "../../domain/workspace";
import {
  canvasPointToFrameStyle,
  canvasViewToFrameStyle,
  type CanvasPoint,
  type MaskViewTransform,
} from "./segmentMaskDraft";
import { DEFAULT_PALETTE_SNAP, DockedPaletteDndContext, type PaletteSnap } from "../../shared/hooks/useDockedPalette";

export type MaskEditTool = "wand-add" | "wand-subtract" | "brush-add" | "brush-subtract";
export type MaskToolDock = PaletteSnap;

export function PreviewFigure({
  caption,
  imageAlt,
  imageSrc,
  imageRef,
  icon: Icon,
  canvasBox,
  className = "",
  frameTestId,
  isInteractive = false,
  liveMaskOverlayActive = false,
  liveMaskOverlayRef,
  liveSelectionOperation,
  liveSelectionOverlayActive = false,
  liveSelectionOverlayRef,
  maskOverlaySrc,
  selectionOverlaySrc,
  selectionOperation,
  isDraftOverlay = false,
  placeholderLabel = "Pending",
  status,
  tone,
  tools,
  viewControls,
  viewTransform,
  brushCursor,
  brushSize,
  cursorTool,
  cursorOperation = "add",
  onClick,
  onImageLoad,
  onNativeGestureChange,
  onNativeGestureEnd,
  onNativeGestureStart,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
}: {
  caption: string;
  imageAlt: string;
  imageSrc: string | undefined;
  imageRef?: Ref<HTMLImageElement>;
  icon: LucideIcon;
  canvasBox?: Box;
  className?: string;
  frameTestId?: string;
  isInteractive?: boolean;
  liveMaskOverlayActive?: boolean;
  liveMaskOverlayRef?: Ref<HTMLCanvasElement>;
  liveSelectionOperation?: "add" | "subtract";
  liveSelectionOverlayActive?: boolean;
  liveSelectionOverlayRef?: Ref<HTMLCanvasElement>;
  maskOverlaySrc?: string;
  selectionOverlaySrc?: string;
  selectionOperation?: "add" | "subtract";
  isDraftOverlay?: boolean;
  placeholderLabel?: string;
  status: string;
  tone?: "mask";
  tools?: ReactNode;
  viewControls?: ReactNode;
  viewTransform?: MaskViewTransform;
  brushCursor?: CanvasPoint | null;
  brushSize?: number;
  cursorTool?: MaskEditTool | null;
  cursorOperation?: "add" | "subtract";
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onImageLoad?: () => void;
  onNativeGestureChange?: (event: Event) => void;
  onNativeGestureEnd?: (event: Event) => void;
  onNativeGestureStart?: (event: Event) => void;
  onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  onWheel?: (event: WheelEvent<HTMLDivElement>) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return undefined;
    }
    const updateFrameSize = () => setFrameSize({
      width: frame.clientWidth,
      height: frame.clientHeight,
    });
    updateFrameSize();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || (!onNativeGestureStart && !onNativeGestureChange && !onNativeGestureEnd)) {
      return undefined;
    }
    const start = (event: Event) => onNativeGestureStart?.(event);
    const change = (event: Event) => onNativeGestureChange?.(event);
    const end = (event: Event) => onNativeGestureEnd?.(event);
    frame.addEventListener("gesturestart", start, { passive: false });
    frame.addEventListener("gesturechange", change, { passive: false });
    frame.addEventListener("gestureend", end, { passive: false });
    return () => {
      frame.removeEventListener("gesturestart", start);
      frame.removeEventListener("gesturechange", change);
      frame.removeEventListener("gestureend", end);
    };
  }, [onNativeGestureChange, onNativeGestureEnd, onNativeGestureStart]);

  const cursorStyle = buildCursorStyle(brushCursor, brushSize, canvasBox, frameSize, viewTransform);
  const sourceViewStyle = canvasBox && viewTransform
    ? canvasViewToFrameStyle(canvasBox, frameSize, viewTransform)
    : undefined;
  const liveCanvasSize = canvasBox
    ? {
      width: Math.max(1, Math.round(canvasBox.w)),
      height: Math.max(1, Math.round(canvasBox.h)),
    }
    : null;
  const imageNode = imageSrc ? (
    <img alt={imageAlt} draggable={false} onLoad={onImageLoad} ref={imageRef} src={imageSrc} />
  ) : (
    <div className="segment-edge-preview-placeholder">
      <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      <span>{placeholderLabel}</span>
    </div>
  );

  return (
    <figure className={`segment-edge-preview ${className}`.trim()} data-tone={tone}>
      <figcaption>
        <strong>{caption}</strong>
        <span>{status}</span>
      </figcaption>
      <div
        ref={frameRef}
        className="segment-edge-preview-frame"
        data-interactive={isInteractive}
        data-testid={frameTestId}
        data-view-scale={viewTransform ? formatScale(viewTransform.scale) : undefined}
        onClick={onClick}
        onPointerCancel={onPointerCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {sourceViewStyle ? (
          <div className="segment-source-view" style={sourceViewStyle}>
            {imageNode}
            {liveCanvasSize && liveMaskOverlayRef ? (
              <canvas
                aria-hidden="true"
                className="segment-source-mask-overlay segment-source-live-mask-overlay"
                data-active={liveMaskOverlayActive}
                data-color="quick-mask-pink"
                data-draft={liveMaskOverlayActive}
                data-mask-display="background"
                data-testid={liveMaskOverlayActive ? "segment-draft-mask-overlay" : undefined}
                height={liveCanvasSize.height}
                ref={liveMaskOverlayRef}
                width={liveCanvasSize.width}
              />
            ) : null}
            {maskOverlaySrc && !liveMaskOverlayActive ? (
              <img
                alt=""
                aria-hidden="true"
                className="segment-source-mask-overlay"
                data-color="quick-mask-pink"
                data-draft={isDraftOverlay}
                data-mask-display="background"
                data-testid={isDraftOverlay ? "segment-draft-mask-overlay" : "segment-background-mask-overlay"}
                draggable={false}
                src={maskOverlaySrc}
              />
            ) : null}
            {liveCanvasSize && liveSelectionOverlayRef ? (
              <canvas
                aria-hidden="true"
                className="segment-selection-overlay segment-source-live-selection-overlay"
                data-active={liveSelectionOverlayActive}
                data-color="quick-mask-pink"
                data-operation={liveSelectionOperation}
                data-render="outline"
                data-testid={liveSelectionOverlayActive ? "segment-selection-overlay" : undefined}
                height={liveCanvasSize.height}
                ref={liveSelectionOverlayRef}
                width={liveCanvasSize.width}
              />
            ) : null}
            {selectionOverlaySrc && !liveSelectionOverlayActive ? (
              <img
                alt=""
                aria-hidden="true"
                className="segment-selection-overlay"
                data-color="quick-mask-pink"
                data-operation={selectionOperation}
                data-render="outline"
                data-testid="segment-selection-overlay"
                draggable={false}
                src={selectionOverlaySrc}
              />
            ) : null}
          </div>
        ) : (
          imageNode
        )}
        {cursorStyle ? (
          <span
            aria-hidden="true"
            className="segment-brush-cursor"
            data-cursor-style="ps-ring"
            data-operation={cursorOperation}
            data-size={String(brushSize)}
            data-tool={cursorTool ?? undefined}
            data-testid="segment-brush-cursor"
            style={cursorStyle}
          />
        ) : null}
        {viewControls}
        {tools}
      </div>
    </figure>
  );
}

export function MaskEditTools({
  activeTool,
  brushSize,
  dock = DEFAULT_PALETTE_SNAP,
  wandTolerance,
  onCleanFragments,
  onBrushSizeChange,
  onDockChange,
  onSelectTool,
  onWandToleranceChange,
}: {
  activeTool: MaskEditTool | null;
  brushSize: number;
  dock?: MaskToolDock;
  wandTolerance: number;
  onCleanFragments: () => void;
  onBrushSizeChange: (size: number) => void;
  onDockChange?: (dock: MaskToolDock) => void;
  onSelectTool: (tool: MaskEditTool | null) => void;
  onWandToleranceChange: (tolerance: number) => void;
}) {
  const isWandTool = activeTool?.startsWith("wand-") ?? false;
  const sliderLabel = isWandTool ? "Magic wand tolerance" : "Brush size";
  const sliderValue = isWandTool ? wandTolerance : brushSize;
  const sliderOutput = isWandTool ? `T ${wandTolerance}` : `${brushSize}px`;
  function toggleTool(tool: MaskEditTool) {
    onSelectTool(activeTool === tool ? null : tool);
  }
  function handleSliderChange(value: number) {
    if (isWandTool) {
      onWandToleranceChange(value);
      return;
    }
    onBrushSizeChange(value);
  }

  return (
    <DockedPaletteDndContext onDockChange={onDockChange}>
      {({ dragHandleProps, isDragging, paletteStyle, setPaletteNode }) => {
        const { ref: dragHandleRef, ...dragHandleAttributes } = dragHandleProps;
        const dockStyle = {
          ...paletteStyle,
          "--palette-offset": `${dock.offset}px`,
        } as CSSProperties;
        return (
          <div
            ref={setPaletteNode as Ref<HTMLDivElement>}
            className="segment-mask-edit-tools"
            role="toolbar"
            aria-label="Mask edit tools"
            data-dragging={isDragging}
            data-edge={dock.edge}
            data-offset={String(Math.round(dock.offset))}
            onClick={stopToolbarEvent}
            onPointerDown={stopToolbarEvent}
            style={dockStyle}
          >
            <button
              ref={dragHandleRef as Ref<HTMLButtonElement>}
              aria-label="Move mask tools"
              className="segment-tool-drag-handle"
              title="Move mask tools"
              type="button"
              {...dragHandleAttributes}
            >
              <Move aria-hidden="true" size={16} />
            </button>
            <IconToolButton
              active={activeTool === "wand-add"}
              icon={WandSparkles}
              label="Magic wand add"
              marker="plus"
              onClick={() => toggleTool("wand-add")}
              tool="wand-add"
            />
            <IconToolButton
              active={activeTool === "wand-subtract"}
              icon={WandSparkles}
              label="Magic wand subtract"
              marker="minus"
              onClick={() => toggleTool("wand-subtract")}
              tool="wand-subtract"
            />
            <IconToolButton
              active={activeTool === "brush-add"}
              icon={Brush}
              label="Brush add"
              marker="plus"
              onClick={() => toggleTool("brush-add")}
              tool="brush-add"
            />
            <IconToolButton
              active={activeTool === "brush-subtract"}
              icon={Eraser}
              label="Brush erase"
              marker="minus"
              onClick={() => toggleTool("brush-subtract")}
              tool="brush-subtract"
            />
            <IconToolButton
              icon={Sparkles}
              label="Clean tiny mask fragments"
              onClick={onCleanFragments}
              tool="clean-fragments"
            />
            <label className="segment-brush-size-control">
              <input
                aria-label={sliderLabel}
                max={isWandTool ? 72 : 48}
                min={4}
                onChange={(event) => handleSliderChange(Number(event.currentTarget.value))}
                step={2}
                type="range"
                value={sliderValue}
              />
              <output aria-label={`${sliderLabel} value`}>{sliderOutput}</output>
            </label>
          </div>
        );
      }}
    </DockedPaletteDndContext>
  );
}

export function SourceViewControls({
  onFit,
  onZoomIn,
  onZoomOut,
}: {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <div
      className="segment-source-view-controls"
      aria-label="Source crop view controls"
      onClick={stopToolbarEvent}
      onPointerDown={stopToolbarEvent}
    >
      <button aria-label="Zoom source crop out" onClick={onZoomOut} title="Zoom source crop out" type="button">
        <ZoomOut aria-hidden="true" size={15} />
      </button>
      <button aria-label="Fit source crop" onClick={onFit} title="Fit source crop" type="button">
        <Maximize2 aria-hidden="true" size={15} />
      </button>
      <button aria-label="Zoom source crop in" onClick={onZoomIn} title="Zoom source crop in" type="button">
        <ZoomIn aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

function stopToolbarEvent(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  // WHY: 控件浮在可编辑源图上方，阻断冒泡能避免真实鼠标点击被父级画布当作魔棒或画笔输入。
  event.stopPropagation();
}

function IconToolButton({
  active = false,
  disabled = false,
  label,
  icon: Icon,
  marker,
  tool,
  tone,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  icon: LucideIcon;
  marker?: "plus" | "minus";
  tool: string;
  tone?: "apply";
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      data-active={active}
      data-tone={tone}
      data-tool={tool}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="segment-tool-icon-stack">
        <Icon aria-hidden="true" size={17} />
        {marker === "plus" ? <Plus aria-hidden="true" size={10} /> : null}
        {marker === "minus" ? <Minus aria-hidden="true" size={10} /> : null}
      </span>
    </button>
  );
}

function buildCursorStyle(
  brushCursor: CanvasPoint | null | undefined,
  brushSize: number | undefined,
  canvasBox: Box | undefined,
  frameSize: { width: number; height: number },
  viewTransform: MaskViewTransform | undefined,
): CSSProperties | undefined {
  if (!brushCursor || !brushSize) {
    return undefined;
  }
  if (!canvasBox || frameSize.width <= 0 || frameSize.height <= 0) {
    return {
      left: `${brushCursor.x}px`,
      top: `${brushCursor.y}px`,
      width: `${brushSize}px`,
      height: `${brushSize}px`,
    };
  }
  return canvasPointToFrameStyle(brushCursor, brushSize, canvasBox, frameSize, viewTransform);
}

function formatScale(scale: number): string {
  return Number(scale.toFixed(2)).toString();
}
