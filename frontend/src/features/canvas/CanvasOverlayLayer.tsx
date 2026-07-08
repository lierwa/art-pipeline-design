import { useEffect, useMemo, useRef } from "react";

import {
  type Box,
  type DraftRegion,
  type ElementSelectionMode,
  type OverlayState,
  type SourceMetadata,
} from "../../domain/workspace";
import {
  boxToPercentStyle,
  canvasObjectBoxToPercentStyle,
} from "./canvasStageGeometry";
import type { CanvasObjectView, CanvasSurfaceCapabilities } from "../canvasObjects";

export type CanvasSelectionOverlayView = {
  id: string;
  displayName: string;
  box: Box;
};

type CanvasOverlayLayerProps = {
  canvasObjects: CanvasObjectView[];
  capabilities: CanvasSurfaceCapabilities;
  draftRegion: DraftRegion | null;
  editingElementId: string | null;
  mergePreview: Box | null;
  missingMaskRegion: DraftRegion | null;
  overlays: OverlayState;
  renamingElementId: string | null;
  selectionOverlays?: CanvasSelectionOverlayView[];
  selectedElementId: string | null;
  selectedElementIds: string[];
  source: SourceMetadata;
  splitRegions: DraftRegion[];
  suppressedLabelIds?: string[];
  onCancelRenameElement: () => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onSelectElement: (elementId: string, mode?: ElementSelectionMode) => void;
  onStartRenameElement: (elementId: string) => void;
};

export function CanvasOverlayLayer({
  canvasObjects,
  capabilities,
  draftRegion,
  editingElementId,
  mergePreview,
  missingMaskRegion,
  overlays,
  renamingElementId,
  selectionOverlays = [],
  selectedElementId,
  selectedElementIds,
  source,
  splitRegions,
  suppressedLabelIds = [],
  onCancelRenameElement,
  onCommitRenameElement,
  onSelectElement,
  onStartRenameElement,
}: CanvasOverlayLayerProps) {
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const suppressedLabelIdSet = useMemo(() => new Set(suppressedLabelIds), [suppressedLabelIds]);

  useEffect(() => {
    if (renamingElementId) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingElementId]);

  return (
    <div className="canvas-overlay-layer">
      {canvasObjects.map((object) =>
        overlays.showMasks && object.maskUrl && object.maskBox ? (
          <img
            key={`${object.id}-mask`}
            alt=""
            data-testid={`overlay-mask-${object.id}`}
            className="overlay-mask-image"
            src={object.maskUrl}
            style={boxToPercentStyle(object.maskBox, source)}
          />
        ) : null,
      )}
      {canvasObjects.map((object) => {
        const overlayStyle = canvasObjectBoxToPercentStyle(object.box, source);
        const isSelected = selectedElementId === object.id;
        const isMergeSelected = selectedElementIds.includes(object.id);
        const isEditing = editingElementId === object.id;
        const isRenaming = renamingElementId === object.id;
        const shouldRenderBox = overlays.showBoxes || isSelected || isMergeSelected || isEditing;

        return (
          <div
            key={object.id}
            data-testid={`overlay-region-${object.id}`}
            className={[
              "overlay-item",
              isSelected ? "is-selected" : "",
              isMergeSelected ? "is-merge-selected" : "",
              isEditing ? "is-editing" : "",
            ].filter(Boolean).join(" ")}
            style={overlayStyle}
          >
            {object.contentImageUrl ? (
              <img
                alt=""
                className="canvas-object-image"
                src={object.contentImageUrl}
              />
            ) : null}
            {shouldRenderBox ? (
              <div
                data-testid={`overlay-box-${object.id}`}
                className="overlay-box"
              />
            ) : null}
            {overlays.showNames && !suppressedLabelIdSet.has(object.id) ? (
              isRenaming && capabilities.canRenameObjects ? (
                <input
                  ref={renameInputRef}
                  aria-label={`Rename ${object.displayName}`}
                  data-testid={`overlay-label-${object.id}`}
                  className={`${overlayLabelClassName(object, source)} overlay-label-input`}
                  defaultValue={object.editableName}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => onCommitRenameElement(object.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      onCancelRenameElement();
                    }
                  }}
                />
              ) : capabilities.canRenameObjects ? (
                <button
                  type="button"
                  data-testid={`overlay-label-${object.id}`}
                  className={overlayLabelClassName(object, source)}
                  aria-label={`Rename ${object.displayName}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectElement(object.id, "replace");
                    onStartRenameElement(object.id);
                  }}
                >
                  {object.displayName}
                </button>
              ) : (
                <span
                  data-testid={`overlay-label-${object.id}`}
                  className={overlayLabelClassName(object, source)}
                >
                  {object.displayName}
                </span>
              )
            ) : null}
            {overlays.showThumbs && isSelected && object.thumbnailUrl && !object.contentImageUrl ? (
              <img
                alt=""
                className="overlay-thumb"
                src={object.thumbnailUrl}
              />
            ) : null}
          </div>
        );
      })}
      {selectionOverlays.map((selectionOverlay) => (
        <div
          key={selectionOverlay.id}
          data-testid={`overlay-selection-${selectionOverlay.id}`}
          className="overlay-item overlay-item-selection-projection is-selected"
          style={boxToPercentStyle(selectionOverlay.box, source)}
        >
          <div
            data-testid={`overlay-selection-box-${selectionOverlay.id}`}
            className="overlay-box"
          />
          {overlays.showNames ? (
            <span
              data-testid={`overlay-selection-label-${selectionOverlay.id}`}
              className={overlayLabelClassName(selectionOverlay, source)}
            >
              {selectionOverlay.displayName}
            </span>
          ) : null}
        </div>
      ))}
      {mergePreview ? (
        <div
          className="overlay-item overlay-item-merge-preview"
          style={boxToPercentStyle(mergePreview, source)}
        >
          <div
            className="overlay-box overlay-box-merge-preview"
            data-testid="merge-preview-outline"
          />
        </div>
      ) : null}
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
  );
}

function overlayLabelClassName(object: { box: Box }, source: SourceMetadata): string {
  const classes = ["overlay-label"];
  const relativeWidth = object.box.w / source.width;
  const relativeHeight = object.box.h / source.height;
  const relativeX = object.box.x / source.width;
  const relativeY = object.box.y / source.height;

  if (relativeWidth < 0.09 || relativeHeight < 0.07) {
    classes.push("is-compact");
  }
  if (relativeX > 0.72) {
    classes.push("is-align-right");
  }
  if (relativeY < 0.08) {
    classes.push("is-below");
  }

  return classes.join(" ");
}
