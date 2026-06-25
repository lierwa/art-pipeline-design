import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Crop, ImageOff, Layers } from "lucide-react";

import { isEditableShortcutTarget } from "../../app/keyboardShortcuts";
import { sam2EdgeArtifactUrls, thumbnailUrl } from "../../domain/workspace";
import type { WorkspaceElement } from "../../domain/workspace";
import { MaskEditTools, PreviewFigure, SourceViewControls, type MaskEditTool } from "./SegmentMaskReviewParts";
import {
  SOURCE_VIEW_SCALE_STEP,
  useSegmentMaskDraftEditor,
  type SegmentDraftHistoryStatus,
  type SegmentEdgeBoardHandle,
  type SegmentMaskPatchMeta,
  type SegmentMaskPatchRequest,
} from "./useSegmentMaskDraftEditor";

export type { SegmentDraftHistoryStatus, SegmentEdgeBoardHandle, SegmentMaskPatchMeta };

type SegmentEdgeBoardProps = {
  element: WorkspaceElement | null;
  assetCacheKey?: number;
  workspaceRunId?: string | null;
  isSuggesting?: boolean;
  isAccepting?: boolean;
  isRerunning?: boolean;
  rerunMaskTargetCount?: number;
  onAcceptMask?: (elementId: string) => void;
  onDraftHistoryChange?: (status: SegmentDraftHistoryStatus) => void;
  onPatchMask?: (
    elementId: string,
    patch: SegmentMaskPatchRequest,
    meta?: SegmentMaskPatchMeta,
  ) => boolean | void | Promise<boolean | void>;
  onRerunMask?: () => void;
};

const SEGMENTATION_STATUSES_WITH_PREVIEWS: WorkspaceElement["segmentationStatus"][] = [
  "mask_suggested",
  "mask_editing",
  "mask_accepted",
];

export const SegmentEdgeBoard = forwardRef<SegmentEdgeBoardHandle, SegmentEdgeBoardProps>(function SegmentEdgeBoard({
  element,
  ...props
}, ref) {
  if (!element) {
    return (
      <section className="segment-edge-board segment-edge-board-empty" aria-label="Segment edge board">
        <strong>Segment</strong>
        <p>Select an accepted asset to inspect the SAM2 mask proposal.</p>
      </section>
    );
  }
  return <SegmentEdgeBoardContent ref={ref} element={element} {...props} />;
});

type SegmentEdgeBoardContentProps = Omit<SegmentEdgeBoardProps, "element"> & {
  element: WorkspaceElement;
};

const SegmentEdgeBoardContent = forwardRef<SegmentEdgeBoardHandle, SegmentEdgeBoardContentProps>(function SegmentEdgeBoardContent({
  element,
  assetCacheKey,
  workspaceRunId,
  isSuggesting = false,
  isAccepting = false,
  isRerunning = false,
  rerunMaskTargetCount = 1,
  onAcceptMask,
  onDraftHistoryChange,
  onPatchMask,
  onRerunMask,
}, ref) {
  const [activeTool, setActiveTool] = useState<MaskEditTool | null>(null);
  const [brushSize, setBrushSize] = useState(18);
  const [wandTolerance, setWandTolerance] = useState(28);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);

  const activeElement = element;
  const sam2EdgeUrls = sam2EdgeArtifactUrls(element, assetCacheKey, workspaceRunId);
  const hasMaskPreviewArtifacts = SEGMENTATION_STATUSES_WITH_PREVIEWS.includes(element.segmentationStatus);
  const hasAcceptedMask = element.segmentationStatus === "mask_accepted";
  const cropPreviewSrc = hasMaskPreviewArtifacts
    ? sam2EdgeUrls.sourceCropUrl
    : thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId);
  const maskPreviewSrc = hasMaskPreviewArtifacts ? sam2EdgeUrls.maskUrl : null;
  const stickerPreviewSrc = hasMaskPreviewArtifacts ? sam2EdgeUrls.transparentAssetUrl : null;
  const maskAssetVersion = `${activeElement.id}:${activeElement.mask ?? ""}:${assetCacheKey ?? 0}:${workspaceRunId ?? ""}`;
  const reviewState = maskReviewState(element);
  // WHY: 父级 SAM2 失败或 child 依赖错误时，用户仍需要从空白 mask 开始手工修复；
  // brush 首次提交走 replace + mask_delta，保留现有后端协议，不再强依赖已有 artifact。
  const canPatchMask = Boolean(onPatchMask) && !isSuggesting && !isRerunning;
  const editor = useSegmentMaskDraftEditor({
    activeElement,
    activeTool,
    brushSize,
    canPatchMask,
    maskAssetVersion,
    maskImageRef,
    onDraftHistoryChange,
    onPatchMask,
    sourceImageRef,
    wandTolerance,
  });
  const draftMaskSrc = editor.draftMask?.maskDataUrl ?? null;
  const sourceMaskOverlaySrc = editor.draftMask?.displayOverlayDataUrl ?? editor.maskDisplayOverlaySrc;
  const draftStickerSrc = editor.draftMask?.stickerDataUrl ?? null;

  useImperativeHandle(ref, () => ({
    undoDraft: editor.undoDraft,
    redoDraft: editor.redoDraft,
    clearDraftHistory: editor.clearDraftHistory,
  }));

  useEffect(() => {
    function handleBracketShortcut(event: globalThis.KeyboardEvent) {
      const direction = bracketDirection(event);
      if (direction === 0 || !activeTool || isEditableShortcutTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (activeTool.startsWith("wand-")) {
        setWandTolerance((current) => clampToolValue(current + direction * 2, 4, 72));
        return;
      }
      setBrushSize((current) => clampToolValue(current + direction * 2, 4, 48));
    }
    window.addEventListener("keydown", handleBracketShortcut);
    return () => window.removeEventListener("keydown", handleBracketShortcut);
  }, [activeTool]);

  return (
    <section className="segment-edge-board" aria-label={`${element.name} segment edge board`}>
      <div className="segment-edge-board-header">
        <div>
          <span>Mask review</span>
          <h3>{element.name}</h3>
          <strong className="segment-edge-state" data-tone={reviewState.tone}>
            {reviewState.label}
          </strong>
        </div>
        <div className="segment-edge-board-actions">
          {onRerunMask ? (
            <button
              className="secondary-action"
              disabled={isRerunning || isSuggesting || isAccepting || rerunMaskTargetCount <= 0}
              onClick={onRerunMask}
              type="button"
            >
              {rerunMaskTargetCount > 1 ? `Rerun ${rerunMaskTargetCount} masks` : "Rerun mask"}
            </button>
          ) : null}
          {hasMaskPreviewArtifacts && !hasAcceptedMask ? (
            <button
              className="primary-action"
              disabled={isAccepting}
              onClick={() => onAcceptMask?.(element.id)}
              type="button"
            >
              Accept mask
            </button>
          ) : null}
        </div>
      </div>
      {editor.shouldPreloadCommittedMask && maskPreviewSrc ? (
        <img
          alt=""
          aria-hidden="true"
          data-testid="segment-committed-mask-preload"
          draggable={false}
          onLoad={editor.handleCommittedMaskAssetLoad}
          src={maskPreviewSrc}
          style={{ display: "none" }}
        />
      ) : null}
      <ol className="segment-mask-review" aria-label="Mask review stages">
        <li className="segment-mask-review-primary">
          <PreviewFigure
            brushCursor={editor.brushCursor}
            brushSize={brushSize}
            canvasBox={activeElement.canvas}
            caption="Source crop"
            cursorOperation={activeTool === "brush-subtract" ? "subtract" : "add"}
            cursorTool={activeTool}
            frameTestId="segment-source-frame"
            imageAlt={`${element.name} source crop`}
            imageRef={sourceImageRef}
            imageSrc={cropPreviewSrc ?? undefined}
            icon={Crop}
            isDraftOverlay={Boolean(draftMaskSrc || editor.liveBrushDraft.active)}
            isInteractive={canPatchMask && Boolean(activeTool)}
            liveMaskOverlayActive={editor.liveBrushDraft.active}
            liveMaskOverlayRef={editor.liveMaskOverlayCanvasRef}
            liveSelectionOperation={editor.liveBrushDraft.operation ?? undefined}
            liveSelectionOverlayActive={editor.liveBrushDraft.active}
            liveSelectionOverlayRef={editor.liveSelectionCanvasRef}
            maskOverlaySrc={sourceMaskOverlaySrc ?? undefined}
            onClick={editor.handleSourceClick}
            onNativeGestureChange={editor.handleSourceGestureChange}
            onNativeGestureEnd={editor.handleSourceGestureEnd}
            onNativeGestureStart={editor.handleSourceGestureStart}
            onPointerCancel={editor.handleSourcePointerCancel}
            onPointerDown={editor.handleSourcePointerDown}
            onPointerMove={editor.handleSourcePointerMove}
            onPointerUp={editor.handleSourcePointerUp}
            onWheel={editor.handleSourceWheel}
            selectionOperation={editor.draftMask?.selectionOperation ?? undefined}
            selectionOverlaySrc={editor.draftMask?.selectionDataUrl ?? undefined}
            status={hasMaskPreviewArtifacts ? "Crop ready" : "Reference crop"}
            viewControls={(
              <SourceViewControls
                onFit={editor.fitSourceView}
                onZoomIn={() => editor.zoomSourceView(SOURCE_VIEW_SCALE_STEP)}
                onZoomOut={() => editor.zoomSourceView(1 / SOURCE_VIEW_SCALE_STEP)}
              />
            )}
            viewTransform={editor.sourceViewTransform}
            tools={canPatchMask ? (
              <MaskEditTools
                activeTool={activeTool}
                brushSize={brushSize}
                dock={editor.toolDock}
                wandTolerance={wandTolerance}
                onBrushSizeChange={setBrushSize}
                onCleanFragments={editor.cleanDraftFragments}
                onDockChange={editor.setToolDock}
                onSelectTool={setActiveTool}
                onWandToleranceChange={setWandTolerance}
              />
            ) : null}
          />
        </li>
        <li className="segment-mask-review-secondary">
          <PreviewFigure
            caption="Mask proposal"
            imageAlt={`${element.name} SAM2 edge mask`}
            imageRef={maskImageRef}
            imageSrc={draftMaskSrc ?? maskPreviewSrc ?? undefined}
            icon={ImageOff}
            onImageLoad={draftMaskSrc ? undefined : editor.refreshMaskDisplayOverlay}
            placeholderLabel="No mask yet"
            status={hasMaskPreviewArtifacts ? "Draft ready" : "Ready for mask"}
            tone="mask"
          />
        </li>
        <li className="segment-mask-review-secondary">
          <PreviewFigure
            caption="Sticker preview"
            className="checkerboard-preview"
            imageAlt={draftStickerSrc ? `${element.name} draft sticker preview` : `${element.name} transparent sticker`}
            imageSrc={draftStickerSrc ?? stickerPreviewSrc ?? undefined}
            icon={Layers}
            placeholderLabel="No sticker yet"
            status={hasMaskPreviewArtifacts ? "Preview ready" : "Waiting"}
          />
        </li>
      </ol>
    </section>
  );
});

function maskReviewState(element: WorkspaceElement): { label: string; tone: "ready" | "draft" | "done" | "blocked" } {
  if (element.segmentationStatus === "mask_accepted") {
    return { label: "Mask accepted", tone: "done" };
  }
  if (["mask_suggested", "mask_editing"].includes(element.segmentationStatus)) {
    return { label: "Review mask", tone: "draft" };
  }
  if (element.segmentationStatus === "mask_rejected") {
    return { label: "Mask rejected", tone: "blocked" };
  }
  return { label: "Ready for mask", tone: "ready" };
}

function bracketDirection(event: globalThis.KeyboardEvent): -1 | 0 | 1 {
  if (event.code === "BracketLeft" || event.key === "[") {
    return -1;
  }
  if (event.code === "BracketRight" || event.key === "]") {
    return 1;
  }
  return 0;
}

function clampToolValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
