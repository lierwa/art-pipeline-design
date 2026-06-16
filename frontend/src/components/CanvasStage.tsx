import { CSSProperties } from "react";

import { OverlayState, SourceMetadata, WorkspaceElement, thumbnailUrl } from "../workspace";

type CanvasStageProps = {
  previewUrl: string | null;
  source: SourceMetadata | null;
  overlays: OverlayState;
  overlayElements: WorkspaceElement[];
  selectedElementId: string | null;
  sourceDetails: string;
  onToggleOverlay: (key: keyof OverlayState) => void;
};

export function CanvasStage({
  previewUrl,
  source,
  overlays,
  overlayElements,
  selectedElementId,
  sourceDetails,
  onToggleOverlay,
}: CanvasStageProps) {
  const artboard = previewUrl && source ? (
    <CanvasArtboard
      previewUrl={previewUrl}
      source={source}
      overlays={overlays}
      overlayElements={overlayElements}
      selectedElementId={selectedElementId}
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
      </div>
      <div className="canvas-stage">
        {artboard ?? (
          <div className="canvas-empty">
            <p>Upload a PNG to populate the workbench canvas.</p>
          </div>
        )}
      </div>
    </section>
  );
}

type CanvasArtboardProps = {
  previewUrl: string;
  source: SourceMetadata;
  overlays: OverlayState;
  overlayElements: WorkspaceElement[];
  selectedElementId: string | null;
};

function CanvasArtboard({
  previewUrl,
  source,
  overlays,
  overlayElements,
  selectedElementId,
}: CanvasArtboardProps) {
  return (
    <div
      className="canvas-artboard"
      style={{
        aspectRatio: `${source.width} / ${source.height}`,
      }}
    >
      <img
        alt="Uploaded source"
        className="canvas-image"
        src={previewUrl}
      />
      <div className="canvas-overlay-layer" aria-hidden="true">
        {overlayElements.map((element) => {
          const overlayStyle: CSSProperties = {
            left: `${(element.bbox.x / source.width) * 100}%`,
            top: `${(element.bbox.y / source.height) * 100}%`,
            width: `${(element.bbox.w / source.width) * 100}%`,
            height: `${(element.bbox.h / source.height) * 100}%`,
          };
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
              {overlays.showMasks ? (
                <div className="overlay-mask-placeholder">No mask</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
