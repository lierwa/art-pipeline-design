import { CSSProperties, MouseEvent, PointerEvent, useRef } from "react";

import {
  Box,
  CanvasTool,
  DraftRegion,
  OverlayState,
  SourceMetadata,
  WorkspaceElement,
  thumbnailUrl,
  workspaceAssetUrl,
} from "../workspace";

type CanvasStageProps = {
  sourceUrl: string | null;
  source: SourceMetadata | null;
  overlays: OverlayState;
  overlayElements: WorkspaceElement[];
  selectedElementId: string | null;
  sourceDetails: string;
  tool: CanvasTool;
  draftRegion: DraftRegion | null;
  splitRegions: DraftRegion[];
  missingMaskRegion: DraftRegion | null;
  assetCacheKey: number;
  canSplit: boolean;
  canDrawMissingMask: boolean;
  onToggleOverlay: (key: keyof OverlayState) => void;
  onSelectTool: (tool: CanvasTool) => void;
  onDraftRegionChange: (region: DraftRegion | null) => void;
  onAddSplitRegion: (region: DraftRegion) => void;
  onMissingMaskRegionChange: (region: DraftRegion | null) => void;
  onCompleteMissingMaskRegion: (region: DraftRegion) => void;
  onClearDrafts: () => void;
  onApplySplit: () => void;
};

type PointerDraft = {
  startX: number;
  startY: number;
};

type DrawingEvent = PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>;

export function CanvasStage({
  sourceUrl,
  source,
  overlays,
  overlayElements,
  selectedElementId,
  sourceDetails,
  tool,
  draftRegion,
  splitRegions,
  missingMaskRegion,
  assetCacheKey,
  canSplit,
  canDrawMissingMask,
  onToggleOverlay,
  onSelectTool,
  onDraftRegionChange,
  onAddSplitRegion,
  onMissingMaskRegionChange,
  onCompleteMissingMaskRegion,
  onClearDrafts,
  onApplySplit,
}: CanvasStageProps) {
  const pointerDraftRef = useRef<PointerDraft | null>(null);

  function beginDraw(event: DrawingEvent) {
    if (!source || tool === "select") {
      return;
    }
    if (tool === "missing-mask" && !canDrawMissingMask) {
      return;
    }

    const nextPoint = eventPointToImage(event, source);
    pointerDraftRef.current = {
      startX: nextPoint.x,
      startY: nextPoint.y,
    };
  }

  function updateDraw(event: DrawingEvent) {
    if (!source || !pointerDraftRef.current) {
      return;
    }

    const currentPoint = eventPointToImage(event, source);
    const bbox = pointsToBox(
      pointerDraftRef.current.startX,
      pointerDraftRef.current.startY,
      currentPoint.x,
      currentPoint.y,
    );
    if (tool === "draw") {
      onDraftRegionChange({ bbox });
      return;
    }
    if (tool === "missing-mask") {
      onMissingMaskRegionChange({ bbox });
    }
  }

  function endDraw(event: DrawingEvent) {
    if (!source || !pointerDraftRef.current) {
      return;
    }

    const currentPoint = eventPointToImage(event, source);
    const bbox = pointsToBox(
      pointerDraftRef.current.startX,
      pointerDraftRef.current.startY,
      currentPoint.x,
      currentPoint.y,
    );
    pointerDraftRef.current = null;

    if (bbox.w <= 0 || bbox.h <= 0) {
      if (tool === "draw") {
        onDraftRegionChange(null);
      }
      if (tool === "missing-mask") {
        onMissingMaskRegionChange(null);
      }
      return;
    }

    if (tool === "draw") {
      onDraftRegionChange({ bbox });
      return;
    }

    if (tool === "split") {
      onAddSplitRegion({ bbox });
      return;
    }

    if (tool === "missing-mask") {
      const region = { bbox };
      onMissingMaskRegionChange(region);
      onCompleteMissingMaskRegion(region);
    }
  }

  const artboard = sourceUrl && source ? (
    <CanvasArtboard
      sourceUrl={sourceUrl}
      source={source}
      overlays={overlays}
      overlayElements={overlayElements}
      selectedElementId={selectedElementId}
      draftRegion={draftRegion}
      splitRegions={splitRegions}
      missingMaskRegion={missingMaskRegion}
      assetCacheKey={assetCacheKey}
      onPointerDown={beginDraw}
      onPointerMove={updateDraw}
      onPointerUp={endDraw}
    />
  ) : null;

  return (
    <section className="canvas-panel" data-testid="canvas-area">
      <div className="canvas-header">
        <h2>Canvas</h2>
        <span>{sourceDetails}</span>
      </div>
      <div className="canvas-toolbar">
        <label className="panel-checkbox">
          <input
            aria-label="Show boxes"
            type="checkbox"
            checked={overlays.showBoxes}
            onChange={() => onToggleOverlay("showBoxes")}
          />
          <span>Show boxes</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show names"
            type="checkbox"
            checked={overlays.showNames}
            onChange={() => onToggleOverlay("showNames")}
          />
          <span>Show names</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show thumbnails and selection"
            type="checkbox"
            checked={overlays.showThumbs}
            onChange={() => onToggleOverlay("showThumbs")}
          />
          <span>Show thumbnails/selection</span>
        </label>
        <label className="panel-checkbox">
          <input
            aria-label="Show masks"
            type="checkbox"
            checked={overlays.showMasks}
            onChange={() => onToggleOverlay("showMasks")}
          />
          <span>Show masks</span>
        </label>
        <div className="canvas-tool-group">
          <button
            type="button"
            className={tool === "select" ? "is-active" : ""}
            onClick={() => onSelectTool("select")}
          >
            Select
          </button>
          <button
            type="button"
            className={tool === "draw" ? "is-active" : ""}
            disabled={!source}
            onClick={() => onSelectTool("draw")}
          >
            Draw element
          </button>
          <button
            type="button"
            className={tool === "split" ? "is-active" : ""}
            disabled={!source || !canSplit}
            onClick={() => onSelectTool("split")}
          >
            Split selected
          </button>
          <button
            type="button"
            className={tool === "missing-mask" ? "is-active" : ""}
            disabled={!source || !canDrawMissingMask}
            onClick={() => onSelectTool("missing-mask")}
          >
            Missing mask
          </button>
        </div>
      </div>
      <div className="canvas-stage">
        {artboard ?? (
          <div className="canvas-empty">
            <p>Upload a PNG to populate the workbench canvas.</p>
          </div>
        )}
      </div>
      {(draftRegion || splitRegions.length > 0 || missingMaskRegion) && (
        <div className="canvas-draft-panel">
          {draftRegion ? <span>Draft region {draftRegion.bbox.w} x {draftRegion.bbox.h}</span> : null}
          {splitRegions.length > 0 ? <span>Split regions: {splitRegions.length}</span> : null}
          {missingMaskRegion ? (
            <span>Missing mask draft {missingMaskRegion.bbox.w} x {missingMaskRegion.bbox.h}</span>
          ) : null}
          <div className="canvas-draft-actions">
            <button type="button" onClick={onClearDrafts}>
              Clear drafts
            </button>
            {splitRegions.length > 0 ? (
              <button type="button" onClick={onApplySplit}>
                Apply split
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

type CanvasArtboardProps = {
  sourceUrl: string;
  source: SourceMetadata;
  overlays: OverlayState;
  overlayElements: WorkspaceElement[];
  selectedElementId: string | null;
  draftRegion: DraftRegion | null;
  splitRegions: DraftRegion[];
  missingMaskRegion: DraftRegion | null;
  assetCacheKey: number;
  onPointerDown: (event: DrawingEvent) => void;
  onPointerMove: (event: DrawingEvent) => void;
  onPointerUp: (event: DrawingEvent) => void;
};

function CanvasArtboard({
  sourceUrl,
  source,
  overlays,
  overlayElements,
  selectedElementId,
  draftRegion,
  splitRegions,
  missingMaskRegion,
  assetCacheKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: CanvasArtboardProps) {
  return (
    <div
      className="canvas-artboard"
      style={{
        aspectRatio: `${source.width} / ${source.height}`,
      }}
    >
      <img
        alt="Workspace source"
        className="canvas-image"
        src={sourceUrl}
      />
      <div className="canvas-overlay-layer" aria-hidden="true">
        {overlayElements.map((element) =>
          overlays.showMasks && element.mask ? (
            <img
              key={`${element.id}-mask`}
              alt=""
              data-testid={`overlay-mask-${element.id}`}
              className="overlay-mask-image"
              src={workspaceAssetUrl(element.mask, assetCacheKey) ?? undefined}
              style={boxToPercentStyle(element.canvas, source)}
            />
          ) : null,
        )}
        {overlayElements.map((element) => {
          const overlayStyle = boxToPercentStyle(element.bbox, source);
          const isSelected = selectedElementId === element.id;

          return (
            <div
              key={element.id}
              data-testid={`overlay-region-${element.id}`}
              className={`overlay-item${isSelected ? " is-selected" : ""}`}
              style={overlayStyle}
            >
              {overlays.showBoxes ? (
                <div
                  data-testid={`overlay-box-${element.id}`}
                  className="overlay-box"
                />
              ) : null}
              {overlays.showNames ? (
                <div
                  data-testid={`overlay-label-${element.id}`}
                  className="overlay-label"
                >
                  {element.name}
                </div>
              ) : null}
              {overlays.showThumbs && isSelected && element.thumbnail ? (
                <img
                  alt=""
                  className="overlay-thumb"
                  src={thumbnailUrl(element.thumbnail) ?? undefined}
                />
              ) : null}
            </div>
          );
        })}
        {draftRegion ? (
          <div className="overlay-item overlay-item-draft" style={boxToPercentStyle(draftRegion.bbox, source)}>
            <div className="overlay-box overlay-box-draft" />
          </div>
        ) : null}
        {splitRegions.map((region, index) => (
          <div
            key={`split-${index}`}
            className="overlay-item overlay-item-split"
            style={boxToPercentStyle(region.bbox, source)}
          >
            <div className="overlay-box overlay-box-split" />
          </div>
        ))}
        {missingMaskRegion ? (
          <div
            className="overlay-item overlay-item-missing"
            style={boxToPercentStyle(missingMaskRegion.bbox, source)}
          >
            <div className="overlay-box overlay-box-missing" />
          </div>
        ) : null}
      </div>
      <div
        className="canvas-drawing-surface"
        data-testid="canvas-drawing-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
      />
    </div>
  );
}

function pointsToBox(startX: number, startY: number, endX: number, endY: number): Box {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

function eventPointToImage(event: DrawingEvent, source: SourceMetadata): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width || rect.right - rect.left || 1;
  const height = rect.height || rect.bottom - rect.top || 1;
  const nativeEvent = event.nativeEvent as globalThis.PointerEvent | undefined;
  const rawClientX =
    typeof nativeEvent?.clientX === "number"
      ? nativeEvent.clientX
      : typeof event.clientX === "number"
        ? event.clientX
        : rect.left;
  const rawClientY =
    typeof nativeEvent?.clientY === "number"
      ? nativeEvent.clientY
      : typeof event.clientY === "number"
        ? event.clientY
        : rect.top;
  const clientX = Number.isFinite(rawClientX) ? rawClientX : rect.left;
  const clientY = Number.isFinite(rawClientY) ? rawClientY : rect.top;
  const relativeX = clamp((clientX - rect.left) / width, 0, 1);
  const relativeY = clamp((clientY - rect.top) / height, 0, 1);
  return {
    x: Math.round(relativeX * source.width),
    y: Math.round(relativeY * source.height),
  };
}

function boxToPercentStyle(box: Box, source: SourceMetadata): CSSProperties {
  return {
    left: `${(box.x / source.width) * 100}%`,
    top: `${(box.y / source.height) * 100}%`,
    width: `${(box.w / source.width) * 100}%`,
    height: `${(box.h / source.height) * 100}%`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
