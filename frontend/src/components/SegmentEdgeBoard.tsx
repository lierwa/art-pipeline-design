import { useState } from "react";

import { sam2EdgeArtifactUrls } from "../workspace";
import type { Box, WorkspaceElement } from "../workspace";

type SegmentMaskPatchRequest = {
  operation?: "replace" | "add" | "subtract";
  shape: {
    type: "rectangle";
    coordinateSpace: "canvas";
    bbox: Box;
  };
};

type SegmentEdgeBoardProps = {
  element: WorkspaceElement | null;
  assetCacheKey?: number;
  workspaceRunId?: string | null;
  isSuggesting?: boolean;
  isAccepting?: boolean;
  onSuggestMask?: (elementId: string) => void;
  onAcceptMask?: (elementId: string) => void;
  onPatchMask?: (elementId: string, patch: SegmentMaskPatchRequest) => void;
};

export function SegmentEdgeBoard({
  element,
  assetCacheKey,
  workspaceRunId,
  isSuggesting = false,
  isAccepting = false,
  onSuggestMask,
  onAcceptMask,
  onPatchMask,
}: SegmentEdgeBoardProps) {
  const [maskRectDraft, setMaskRectDraft] = useState({
    x: "0",
    y: "0",
    w: element ? String(element.canvas.w) : "1",
    h: element ? String(element.canvas.h) : "1",
  });

  if (!element) {
    return (
      <section className="segment-edge-board segment-edge-board-empty" aria-label="Segment edge board">
        <strong>Segment</strong>
        <p>Select an accepted asset to inspect the SAM2 mask proposal.</p>
      </section>
    );
  }

  const sam2EdgeUrls = sam2EdgeArtifactUrls(
    element,
    assetCacheKey,
    workspaceRunId,
  );

  return (
    <section className="segment-edge-board" aria-label={`${element.name} segment edge board`}>
      <div className="segment-edge-board-header">
        <div>
          <span>Segment</span>
          <h3>{element.name}</h3>
        </div>
        <div className="segment-edge-board-actions">
          <button
            disabled={isSuggesting}
            onClick={() => onSuggestMask?.(element.id)}
            type="button"
          >
            Suggest mask
          </button>
          <button
            className="primary-action"
            disabled={isAccepting}
            onClick={() => onAcceptMask?.(element.id)}
            type="button"
          >
            Accept mask
          </button>
        </div>
      </div>
      <div className="segment-edge-grid">
        <PreviewFigure
          caption="Source crop"
          imageAlt={`${element.name} source crop`}
          imageSrc={sam2EdgeUrls.sourceCropUrl ?? undefined}
        />
        <PreviewFigure
          caption="SAM2 edge mask"
          imageAlt={`${element.name} SAM2 edge mask`}
          imageSrc={sam2EdgeUrls.maskUrl ?? undefined}
          tone="mask"
        />
        <PreviewFigure
          caption="Transparent sticker"
          className="checkerboard-preview"
          imageAlt={`${element.name} transparent sticker`}
          imageSrc={sam2EdgeUrls.transparentAssetUrl ?? undefined}
        />
      </div>
      <fieldset className="segment-manual-controls" aria-label="Manual mask edit">
        <legend>Manual mask edit</legend>
        <div className="segment-manual-grid">
          <NumberField
            label="Mask edit X"
            value={maskRectDraft.x}
            onChange={(value) => setMaskRectDraft((current) => ({ ...current, x: value }))}
          />
          <NumberField
            label="Mask edit Y"
            value={maskRectDraft.y}
            onChange={(value) => setMaskRectDraft((current) => ({ ...current, y: value }))}
          />
          <NumberField
            label="Mask edit width"
            value={maskRectDraft.w}
            onChange={(value) => setMaskRectDraft((current) => ({ ...current, w: value }))}
          />
          <NumberField
            label="Mask edit height"
            value={maskRectDraft.h}
            onChange={(value) => setMaskRectDraft((current) => ({ ...current, h: value }))}
          />
        </div>
        <div className="segment-manual-actions">
          <button
            disabled={isSuggesting}
            onClick={() => onPatchMask?.(element.id, buildRectanglePatch(maskRectDraft))}
            type="button"
          >
            Apply include rectangle
          </button>
          <button
            disabled={isSuggesting}
            onClick={() => onPatchMask?.(element.id, buildRectanglePatch(maskRectDraft, "subtract"))}
            type="button"
          >
            Apply erase rectangle
          </button>
        </div>
      </fieldset>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-group">
      <span>{label}</span>
      <input
        aria-label={label}
        min="0"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function buildRectanglePatch(
  draft: { x: string; y: string; w: string; h: string },
  operation?: "subtract",
): SegmentMaskPatchRequest {
  const patch: SegmentMaskPatchRequest = {
    shape: {
      type: "rectangle",
      coordinateSpace: "canvas",
      bbox: {
        x: parseDraftNumber(draft.x),
        y: parseDraftNumber(draft.y),
        w: Math.max(1, parseDraftNumber(draft.w)),
        h: Math.max(1, parseDraftNumber(draft.h)),
      },
    },
  };
  if (operation) {
    patch.operation = operation;
  }
  return patch;
}

function parseDraftNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function PreviewFigure({
  caption,
  imageAlt,
  imageSrc,
  className = "",
  tone,
}: {
  caption: string;
  imageAlt: string;
  imageSrc: string | undefined;
  className?: string;
  tone?: "mask";
}) {
  return (
    <figure className={`segment-edge-preview ${className}`.trim()} data-tone={tone}>
      {imageSrc ? (
        <img alt={imageAlt} src={imageSrc} />
      ) : (
        <div className="segment-edge-preview-placeholder">Pending</div>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
