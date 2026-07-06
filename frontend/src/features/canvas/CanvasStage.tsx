import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  thumbnailUrl,
  workspaceAssetUrl,
  type Box,
  type CanvasTool,
  type DraftRegion,
  type ElementSelectionMode,
  type OverlayState,
  type SourceMetadata,
  type WorkspaceElement,
} from "../../domain/workspace";
import { CanvasArtboard, type CanvasHitTestStrategy } from "./CanvasArtboard";
import { workspaceElementToCanvasObject } from "./canvasObjectAdapters";
import {
  FOCUS_PAN_THRESHOLD,
  type DrawingEvent,
  calculateFocusPanDelta,
  eventPointToImage,
  normalizeWheelDelta,
  pointsToBox,
  readGestureScale,
} from "./canvasStageGeometry";
import {
  ART_PIPELINE_CANVAS_SURFACE_CAPABILITIES,
  type CanvasObjectView,
  type CanvasSurfaceCapabilities,
} from "../canvasObjects";

export { workspaceElementToCanvasObject };

type CanvasStageProps = {
  canvasObjects?: CanvasObjectView[];
  sourceUrl: string | null;
  source: SourceMetadata | null;
  overlays: OverlayState;
  overlayElements?: WorkspaceElement[];
  selectedElementId: string | null;
  selectedElementIds: string[];
  editingElementId: string | null;
  mergePreview: Box | null;
  sourceDetails: string;
  tool: CanvasTool;
  draftRegion: DraftRegion | null;
  splitRegions: DraftRegion[];
  missingMaskRegion: DraftRegion | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
  capabilities?: CanvasSurfaceCapabilities;
  canDrawMissingMask: boolean;
  hasUnsavedBoxEdit: boolean;
  hitTestStrategy?: CanvasHitTestStrategy;
  showHeader?: boolean;
  zoomPercent: number;
  isPanMode: boolean;
  panOffset: { x: number; y: number };
  focusRequest: { elementId: string; sequence: number } | null;
  manualElementName: string;
  renamingElementId: string | null;
  canCreateChildFromDraft: boolean;
  onSelectElement: (elementId: string, mode?: ElementSelectionMode) => void;
  onClearSelection: () => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onStartRenameElement: (elementId: string) => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onCancelRenameElement: () => void;
  onBoxDraftChange: (elementId: string, bbox: Box) => void;
  onBoxEditEnd?: (elementId: string) => void;
  onBoxEditStart?: (elementId: string) => void;
  onZoomByWheel: (deltaY: number) => void;
  onZoomByGesture: (scaleDelta: number) => void;
  onPanChange: (deltaX: number, deltaY: number) => void;
  onDraftRegionChange: (region: DraftRegion | null) => void;
  onAddSplitRegion: (region: DraftRegion) => void;
  onMissingMaskRegionChange: (region: DraftRegion | null) => void;
  onCompleteMissingMaskRegion: (region: DraftRegion) => void;
  onManualElementNameChange: (value: string) => void;
  onCreateElement: (name: string) => void;
  onCreateChildElement: (name: string) => void;
  onConfirmBoxEdit: () => void;
  onCancelBoxEdit: () => void;
  onClearDrafts: () => void;
  onApplySplit: () => void;
  onClickDetectPoint?: (point: { x: number; y: number }) => void;
};

type PointerDraft = {
  startX: number;
  startY: number;
};

export function CanvasStage({
  canvasObjects: explicitCanvasObjects,
  sourceUrl,
  source,
  overlays,
  overlayElements = [],
  selectedElementId,
  selectedElementIds,
  editingElementId,
  mergePreview,
  sourceDetails,
  tool,
  draftRegion,
  splitRegions,
  missingMaskRegion,
  assetCacheKey,
  workspaceRunId,
  capabilities = ART_PIPELINE_CANVAS_SURFACE_CAPABILITIES,
  canDrawMissingMask,
  hasUnsavedBoxEdit,
  hitTestStrategy = "smallest-on-modified-selection",
  showHeader = true,
  zoomPercent,
  isPanMode,
  panOffset,
  focusRequest,
  manualElementName,
  renamingElementId,
  canCreateChildFromDraft,
  onSelectElement,
  onClearSelection,
  onOpenElementContextMenu,
  onStartRenameElement,
  onCommitRenameElement,
  onCancelRenameElement,
  onBoxDraftChange,
  onBoxEditEnd,
  onBoxEditStart,
  onZoomByWheel,
  onZoomByGesture,
  onPanChange,
  onDraftRegionChange,
  onAddSplitRegion,
  onMissingMaskRegionChange,
  onCompleteMissingMaskRegion,
  onManualElementNameChange,
  onCreateElement,
  onCreateChildElement,
  onConfirmBoxEdit,
  onCancelBoxEdit,
  onClearDrafts,
  onApplySplit,
  onClickDetectPoint,
}: CanvasStageProps) {
  const canvasPanelRef = useRef<HTMLElement | null>(null);
  const pointerDraftRef = useRef<PointerDraft | null>(null);
  const panDragRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const gestureScaleRef = useRef(1);
  const onZoomByWheelRef = useRef(onZoomByWheel);
  const onZoomByGestureRef = useRef(onZoomByGesture);
  const onPanChangeRef = useRef(onPanChange);
  const canvasObjectsRef = useRef<CanvasObjectView[]>([]);
  const focusPanTimerRef = useRef<number | null>(null);
  const [isFocusPanning, setIsFocusPanning] = useState(false);

  const canvasObjects = useMemo(
    () => {
      if (explicitCanvasObjects) {
        return explicitCanvasObjects;
      }
      return overlayElements
        .slice()
        // WHY: CanvasObjectView 不携带 pipeline layer；排序只在 pipeline 入口完成，命中测试可把数组顺序当作前后关系。
        .sort((left, right) => left.layer - right.layer)
        .map((element) =>
          workspaceElementToCanvasObject(
            element,
            {
              maskUrl: workspaceAssetUrl(element.mask, assetCacheKey, workspaceRunId),
              thumbnailUrl: thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId),
            },
          ),
        );
    },
    [assetCacheKey, explicitCanvasObjects, overlayElements, workspaceRunId],
  );

  useEffect(() => {
    canvasObjectsRef.current = canvasObjects;
    onZoomByWheelRef.current = onZoomByWheel;
    onZoomByGestureRef.current = onZoomByGesture;
    onPanChangeRef.current = onPanChange;
  });

  useEffect(() => {
    return () => {
      if (focusPanTimerRef.current !== null) {
        window.clearTimeout(focusPanTimerRef.current);
      }
    };
  }, []);

  function beginDraw(event: DrawingEvent) {
    if (!source || tool === "select") {
      return;
    }
    if (tool === "click-detect") {
      if (!capabilities.canClickDetect) {
        return;
      }
      onClickDetectPoint?.(eventPointToImage(event, source));
      return;
    }
    if (tool === "draw" && !capabilities.canDraw) {
      return;
    }
    if (tool === "split" && !capabilities.canSplit) {
      return;
    }
    if (tool === "missing-mask" && (!canDrawMissingMask || !capabilities.canUseMissingMask)) {
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
    if (tool === "missing-mask" && capabilities.canUseMissingMask) {
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

    if (tool === "split" && capabilities.canSplit) {
      onAddSplitRegion({ bbox });
      return;
    }

    if (tool === "missing-mask" && capabilities.canUseMissingMask) {
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
      canvasObjects={canvasObjects}
      capabilities={capabilities}
      hitTestStrategy={hitTestStrategy}
      selectedElementId={selectedElementId}
      selectedElementIds={selectedElementIds}
      editingElementId={editingElementId}
      mergePreview={mergePreview}
      draftRegion={draftRegion}
      splitRegions={splitRegions}
      missingMaskRegion={missingMaskRegion}
      tool={tool}
      isPanMode={isPanMode}
      manualElementName={manualElementName}
      renamingElementId={renamingElementId}
      canCreateChildFromDraft={canCreateChildFromDraft}
      hasUnsavedBoxEdit={hasUnsavedBoxEdit}
      onSelectElement={onSelectElement}
      onClearSelection={onClearSelection}
      onOpenElementContextMenu={onOpenElementContextMenu}
      onStartRenameElement={onStartRenameElement}
      onCommitRenameElement={onCommitRenameElement}
      onCancelRenameElement={onCancelRenameElement}
      onBoxDraftChange={onBoxDraftChange}
      onBoxEditEnd={onBoxEditEnd}
      onBoxEditStart={onBoxEditStart}
      onManualElementNameChange={onManualElementNameChange}
      onCreateElement={onCreateElement}
      onCreateChildElement={onCreateChildElement}
      onConfirmBoxEdit={onConfirmBoxEdit}
      onCancelBoxEdit={onCancelBoxEdit}
      onClearDrafts={onClearDrafts}
      onApplySplit={onApplySplit}
      onPointerDown={beginDraw}
      onPointerMove={updateDraw}
      onPointerUp={endDraw}
    />
  ) : null;

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (!isPanMode || !source) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panDragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function updatePan(event: PointerEvent<HTMLDivElement>) {
    if (!isPanMode || !panDragRef.current) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - panDragRef.current.clientX;
    const deltaY = event.clientY - panDragRef.current.clientY;
    panDragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    onPanChange(deltaX, deltaY);
  }

  function endPan() {
    panDragRef.current = null;
  }

  useEffect(() => {
    const canvasPanel = canvasPanelRef.current;
    if (!canvasPanel || !source) {
      return undefined;
    }

    const listenerOptions: AddEventListenerOptions = { passive: false };

    function handleNativeWheel(event: globalThis.WheelEvent) {
      event.preventDefault();
      onZoomByWheelRef.current(normalizeWheelDelta(event));
    }

    function handleGestureStart(event: Event) {
      event.preventDefault();
      gestureScaleRef.current = readGestureScale(event);
    }

    function handleGestureChange(event: Event) {
      event.preventDefault();
      const nextScale = readGestureScale(event);
      const scaleDelta = nextScale - gestureScaleRef.current;
      gestureScaleRef.current = nextScale;
      if (scaleDelta !== 0) {
        onZoomByGestureRef.current(scaleDelta);
      }
    }

    function handleGestureEnd(event: Event) {
      event.preventDefault();
      gestureScaleRef.current = 1;
    }

    canvasPanel.addEventListener("wheel", handleNativeWheel, listenerOptions);
    canvasPanel.addEventListener("gesturestart", handleGestureStart, listenerOptions);
    canvasPanel.addEventListener("gesturechange", handleGestureChange, listenerOptions);
    canvasPanel.addEventListener("gestureend", handleGestureEnd, listenerOptions);

    return () => {
      canvasPanel.removeEventListener("wheel", handleNativeWheel);
      canvasPanel.removeEventListener("gesturestart", handleGestureStart);
      canvasPanel.removeEventListener("gesturechange", handleGestureChange);
      canvasPanel.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [source]);

  useEffect(() => {
    if (!focusRequest || !source) {
      return undefined;
    }

    const canvasPanel = canvasPanelRef.current;
    if (!canvasPanel) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const selectedObject = canvasObjectsRef.current.find((object) => object.id === focusRequest.elementId);
      if (!selectedObject) {
        return;
      }
      const artboardElement = canvasPanel.querySelector<HTMLElement>(".canvas-artboard");
      const stage = canvasPanel.querySelector<HTMLElement>(".canvas-stage");
      if (!artboardElement || !stage) {
        return;
      }

      const artboardRect = artboardElement.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (artboardRect.width <= 0 || artboardRect.height <= 0 || stageRect.width <= 0 || stageRect.height <= 0) {
        return;
      }

      const elementCenterX = selectedObject.box.x + selectedObject.box.w / 2;
      const elementCenterY = selectedObject.box.y + selectedObject.box.h / 2;
      const elementScreenX = artboardRect.left + (elementCenterX / source.width) * artboardRect.width;
      const elementScreenY = artboardRect.top + (elementCenterY / source.height) * artboardRect.height;
      const { deltaX, deltaY } = calculateFocusPanDelta({
        artboardRect,
        stageRect,
        elementScreenX,
        elementScreenY,
      });

      if (Math.abs(deltaX) <= FOCUS_PAN_THRESHOLD && Math.abs(deltaY) <= FOCUS_PAN_THRESHOLD) {
        return;
      }

      setIsFocusPanning(true);
      if (focusPanTimerRef.current !== null) {
        window.clearTimeout(focusPanTimerRef.current);
      }
      focusPanTimerRef.current = window.setTimeout(() => {
        setIsFocusPanning(false);
        focusPanTimerRef.current = null;
      }, 240);
      onPanChangeRef.current(deltaX, deltaY);
    });

    return () => window.cancelAnimationFrame(animationFrame);
    // WHY: focusRequest 是一次性“把外部列表选择带到画布视口”的命令；
    // 拖拽编辑 bbox 会持续更新 overlayElements，不能因此重复执行旧命令，否则画布会追着控制点抖动。
  }, [focusRequest?.elementId, focusRequest?.sequence, source]);

  return (
    <section
      ref={canvasPanelRef}
      className="canvas-panel"
      data-testid="canvas-area"
      data-pan-mode={isPanMode ? "true" : "false"}
    >
      {showHeader ? (
        <div className="canvas-header">
          <h2>Canvas</h2>
          <span>{sourceDetails}</span>
        </div>
      ) : null}
      <div
        className="canvas-stage"
        onPointerDown={beginPan}
        onPointerMove={updatePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {artboard ? (
          <div
            className={`canvas-pan-viewport${isFocusPanning ? " is-focus-panning" : ""}`}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomPercent / 80})`,
            }}
          >
            {artboard}
          </div>
        ) : (
          <div className="canvas-empty">
            <p>Upload a PNG to populate the workbench canvas.</p>
          </div>
        )}
      </div>
    </section>
  );
}
