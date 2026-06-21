import { useEffect, useRef } from "react";

import {
  type Box,
  type DraftRegion,
  type ElementSelectionMode,
  type OverlayState,
  type SourceMetadata,
  type WorkspaceElement,
  thumbnailUrl,
  workspaceAssetUrl,
} from "../../domain/workspace";
import { boxToPercentStyle } from "./canvasStageGeometry";

type CanvasOverlayLayerProps = {
  assetCacheKey: number;
  draftRegion: DraftRegion | null;
  editingElementId: string | null;
  mergePreview: Box | null;
  missingMaskRegion: DraftRegion | null;
  overlayElements: WorkspaceElement[];
  overlays: OverlayState;
  renamingElementId: string | null;
  selectedElementId: string | null;
  selectedElementIds: string[];
  source: SourceMetadata;
  splitRegions: DraftRegion[];
  workspaceRunId: string | null;
  onCancelRenameElement: () => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onSelectElement: (elementId: string, mode?: ElementSelectionMode) => void;
  onStartRenameElement: (elementId: string) => void;
};

export function CanvasOverlayLayer({
  assetCacheKey,
  draftRegion,
  editingElementId,
  mergePreview,
  missingMaskRegion,
  overlayElements,
  overlays,
  renamingElementId,
  selectedElementId,
  selectedElementIds,
  source,
  splitRegions,
  workspaceRunId,
  onCancelRenameElement,
  onCommitRenameElement,
  onSelectElement,
  onStartRenameElement,
}: CanvasOverlayLayerProps) {
  const renameInputRef = useRef<HTMLInputElement | null>(null);

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
      {overlayElements.map((element) =>
        overlays.showMasks && element.mask ? (
          <img
            key={`${element.id}-mask`}
            alt=""
            data-testid={`overlay-mask-${element.id}`}
            className="overlay-mask-image"
            src={workspaceAssetUrl(element.mask, assetCacheKey, workspaceRunId) ?? undefined}
            style={boxToPercentStyle(element.canvas, source)}
          />
        ) : null,
      )}
      {overlayElements.map((element) => {
        const overlayStyle = boxToPercentStyle(element.bbox, source);
        const isSelected = selectedElementId === element.id;
        const isMergeSelected = selectedElementIds.includes(element.id);
        const isEditing = editingElementId === element.id;
        const isRenaming = renamingElementId === element.id;
        const shouldRenderBox = overlays.showBoxes || isSelected || isMergeSelected || isEditing;

        return (
          <div
            key={element.id}
            data-testid={`overlay-region-${element.id}`}
            className={[
              "overlay-item",
              isSelected ? "is-selected" : "",
              isMergeSelected ? "is-merge-selected" : "",
              isEditing ? "is-editing" : "",
            ].filter(Boolean).join(" ")}
            style={overlayStyle}
          >
            {shouldRenderBox ? (
              <div
                data-testid={`overlay-box-${element.id}`}
                className="overlay-box"
              />
            ) : null}
            {overlays.showNames ? (
              isRenaming ? (
                <input
                  ref={renameInputRef}
                  aria-label={`Rename ${element.name}`}
                  data-testid={`overlay-label-${element.id}`}
                  className={`${overlayLabelClassName(element, source)} overlay-label-input`}
                  defaultValue={element.label ?? element.name}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={(event) => onCommitRenameElement(element.id, event.currentTarget.value)}
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
              ) : (
                <button
                  type="button"
                  data-testid={`overlay-label-${element.id}`}
                  className={overlayLabelClassName(element, source)}
                  aria-label={`Rename ${element.name}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectElement(element.id, "replace");
                    onStartRenameElement(element.id);
                  }}
                >
                  {element.name}
                </button>
              )
            ) : null}
            {overlays.showThumbs && isSelected && element.thumbnail ? (
              <img
                alt=""
                className="overlay-thumb"
                src={thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId) ?? undefined}
              />
            ) : null}
          </div>
        );
      })}
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

function overlayLabelClassName(element: WorkspaceElement, source: SourceMetadata): string {
  const classes = ["overlay-label"];
  const relativeWidth = element.bbox.w / source.width;
  const relativeHeight = element.bbox.h / source.height;
  const relativeX = element.bbox.x / source.width;
  const relativeY = element.bbox.y / source.height;

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
