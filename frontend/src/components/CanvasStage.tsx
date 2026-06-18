import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, useEffect, useRef } from "react";

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
  canDrawMissingMask: boolean;
  hasUnsavedBoxEdit: boolean;
  zoomPercent: number;
  isPanMode: boolean;
  panOffset: { x: number; y: number };
  manualElementName: string;
  canCreateChildFromDraft: boolean;
  onSelectElement: (elementId: string) => void;
  onToggleMergeSelection: (elementId: string) => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onBoxDraftChange: (elementId: string, bbox: Box) => void;
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
};

type PointerDraft = {
  startX: number;
  startY: number;
};

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type BoxEditDrag = {
  elementId: string;
  mode: "move" | "resize";
  handle: ResizeHandle | null;
  startX: number;
  startY: number;
  startBox: Box;
};

type DrawingEvent = PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>;
type ClientPositionEvent = {
  clientX: number;
  clientY: number;
  nativeEvent?: {
    clientX?: number;
    clientY?: number;
  };
};

type GestureScaleEvent = Event & {
  scale?: number;
};

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function CanvasStage({
  sourceUrl,
  source,
  overlays,
  overlayElements,
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
  canDrawMissingMask,
  hasUnsavedBoxEdit,
  zoomPercent,
  isPanMode,
  panOffset,
  manualElementName,
  canCreateChildFromDraft,
  onSelectElement,
  onToggleMergeSelection,
  onOpenElementContextMenu,
  onBoxDraftChange,
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
}: CanvasStageProps) {
  const canvasPanelRef = useRef<HTMLElement | null>(null);
  const pointerDraftRef = useRef<PointerDraft | null>(null);
  const panDragRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const gestureScaleRef = useRef(1);
  const onZoomByWheelRef = useRef(onZoomByWheel);
  const onZoomByGestureRef = useRef(onZoomByGesture);

  useEffect(() => {
    onZoomByWheelRef.current = onZoomByWheel;
    onZoomByGestureRef.current = onZoomByGesture;
  });

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
      selectedElementIds={selectedElementIds}
      editingElementId={editingElementId}
      mergePreview={mergePreview}
      draftRegion={draftRegion}
      splitRegions={splitRegions}
      missingMaskRegion={missingMaskRegion}
      assetCacheKey={assetCacheKey}
      workspaceRunId={workspaceRunId}
      tool={tool}
      isPanMode={isPanMode}
      manualElementName={manualElementName}
      canCreateChildFromDraft={canCreateChildFromDraft}
      onSelectElement={onSelectElement}
      onToggleMergeSelection={onToggleMergeSelection}
      onOpenElementContextMenu={onOpenElementContextMenu}
      onBoxDraftChange={onBoxDraftChange}
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
      hasUnsavedBoxEdit={hasUnsavedBoxEdit}
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

  return (
    <section
      ref={canvasPanelRef}
      className="canvas-panel"
      data-testid="canvas-area"
      data-pan-mode={isPanMode ? "true" : "false"}
    >
      <div className="canvas-header">
        <h2>Canvas</h2>
        <span>{sourceDetails}</span>
      </div>
      <div
        className="canvas-stage"
        onPointerDown={beginPan}
        onPointerMove={updatePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {artboard ? (
          <div
            className="canvas-pan-viewport"
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

type CanvasArtboardProps = {
  sourceUrl: string;
  source: SourceMetadata;
  overlays: OverlayState;
  overlayElements: WorkspaceElement[];
  selectedElementId: string | null;
  selectedElementIds: string[];
  editingElementId: string | null;
  mergePreview: Box | null;
  draftRegion: DraftRegion | null;
  splitRegions: DraftRegion[];
  missingMaskRegion: DraftRegion | null;
  assetCacheKey: number;
  workspaceRunId: string | null;
  tool: CanvasTool;
  isPanMode: boolean;
  manualElementName: string;
  canCreateChildFromDraft: boolean;
  hasUnsavedBoxEdit: boolean;
  onSelectElement: (elementId: string) => void;
  onToggleMergeSelection: (elementId: string) => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onBoxDraftChange: (elementId: string, bbox: Box) => void;
  onManualElementNameChange: (value: string) => void;
  onCreateElement: (name: string) => void;
  onCreateChildElement: (name: string) => void;
  onConfirmBoxEdit: () => void;
  onCancelBoxEdit: () => void;
  onClearDrafts: () => void;
  onApplySplit: () => void;
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
  selectedElementIds,
  editingElementId,
  mergePreview,
  draftRegion,
  splitRegions,
  missingMaskRegion,
  assetCacheKey,
  workspaceRunId,
  tool,
  isPanMode,
  manualElementName,
  canCreateChildFromDraft,
  hasUnsavedBoxEdit,
  onSelectElement,
  onToggleMergeSelection,
  onOpenElementContextMenu,
  onBoxDraftChange,
  onManualElementNameChange,
  onCreateElement,
  onCreateChildElement,
  onConfirmBoxEdit,
  onCancelBoxEdit,
  onClearDrafts,
  onApplySplit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: CanvasArtboardProps) {
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const boxEditDragRef = useRef<BoxEditDrag | null>(null);
  const draftNameInputRef = useRef<HTMLInputElement | null>(null);

  function handleDrawingPointerDown(event: DrawingEvent) {
    if (isPanMode) {
      return;
    }
    if (tool === "select") {
      const hitElement = findTopmostHitElement(event);
      if (!hitElement) {
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        onToggleMergeSelection(hitElement.id);
      } else {
        onSelectElement(hitElement.id);
      }
      return;
    }

    onPointerDown(event);
  }

  function handleDrawingContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (isPanMode || tool !== "select") {
      return;
    }

    const hitElement = findTopmostHitElement(event);
    if (!hitElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectElement(hitElement.id);
    onOpenElementContextMenu(hitElement.id, { x: event.clientX, y: event.clientY });
  }

  useEffect(() => {
    const artboard = artboardRef.current;
    if (!artboard) {
      return undefined;
    }

    function handleNativePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const handleControl = target.closest<HTMLElement>("[data-resize-handle]");
      if (handleControl) {
        const element = overlayElements.find((candidate) => candidate.id === handleControl.dataset.elementId);
        const handle = parseResizeHandle(handleControl.dataset.resizeHandle);
        if (element && handle) {
          event.preventDefault();
          startBoxEditDrag(event.clientX, event.clientY, element, "resize", handle);
        }
        return;
      }

      const editRegion = target.closest<HTMLElement>("[data-canvas-edit-region]");
      if (editRegion) {
        const element = overlayElements.find((candidate) => candidate.id === editRegion.dataset.elementId);
        if (element) {
          event.preventDefault();
          startBoxEditDrag(event.clientX, event.clientY, element, "move", null);
        }
      }
    }

    function handleNativePointerMove(event: globalThis.PointerEvent) {
      if (!boxEditDragRef.current) {
        return;
      }

      event.preventDefault();
      updateBoxEditFromClient(event.clientX, event.clientY);
    }

    function handleNativePointerEnd(event: globalThis.PointerEvent) {
      if (!boxEditDragRef.current) {
        return;
      }

      event.preventDefault();
      boxEditDragRef.current = null;
    }

    artboard.addEventListener("pointerdown", handleNativePointerDown);
    artboard.addEventListener("pointermove", handleNativePointerMove);
    artboard.addEventListener("pointerup", handleNativePointerEnd);
    artboard.addEventListener("pointercancel", handleNativePointerEnd);

    return () => {
      artboard.removeEventListener("pointerdown", handleNativePointerDown);
      artboard.removeEventListener("pointermove", handleNativePointerMove);
      artboard.removeEventListener("pointerup", handleNativePointerEnd);
      artboard.removeEventListener("pointercancel", handleNativePointerEnd);
    };
  }, [onBoxDraftChange, onSelectElement, overlayElements, source]);

  function startBoxEditDrag(
    clientX: number,
    clientY: number,
    element: WorkspaceElement,
    mode: "move" | "resize",
    handle: ResizeHandle | null,
  ) {
    const artboard = artboardRef.current;
    if (!artboard) {
      return;
    }

    const point = eventPointToImageWithin({ clientX, clientY }, artboard, source);
    boxEditDragRef.current = {
      elementId: element.id,
      mode,
      handle,
      startX: point.x,
      startY: point.y,
      startBox: element.bbox,
    };
    onSelectElement(element.id);
  }

  function beginBoxMove(event: PointerEvent<HTMLDivElement>, element: WorkspaceElement) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startBoxEditDrag(event.clientX, event.clientY, element, "move", null);
  }

  function beginBoxResize(
    event: PointerEvent<HTMLButtonElement>,
    element: WorkspaceElement,
    handle: ResizeHandle,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startBoxEditDrag(event.clientX, event.clientY, element, "resize", handle);
  }

  function updateBoxEditFromClient(clientX: number, clientY: number) {
    const drag = boxEditDragRef.current;
    const artboard = artboardRef.current;
    if (!drag || !artboard) {
      return;
    }

    const point = eventPointToImageWithin({ clientX, clientY }, artboard, source);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;
    const nextBox =
      drag.mode === "move"
        ? moveBox(drag.startBox, deltaX, deltaY, source)
        : resizeBox(drag.startBox, drag.handle ?? "se", deltaX, deltaY, source);
    onBoxDraftChange(drag.elementId, nextBox);
  }

  function updateBoxEdit(event: PointerEvent<HTMLElement>) {
    if (!boxEditDragRef.current) {
      return;
    }

    event.preventDefault();
    updateBoxEditFromClient(event.clientX, event.clientY);
  }

  function endBoxEdit(event: PointerEvent<HTMLElement>) {
    if (!boxEditDragRef.current) {
      return;
    }

    event.preventDefault();
    boxEditDragRef.current = null;
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLDivElement>, element: WorkspaceElement) {
    const step = event.shiftKey ? 10 : 1;
    const delta = keyboardDelta(event.key, step);
    if (!delta) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBoxDraftChange(element.id, moveBox(element.bbox, delta.x, delta.y, source));
  }

  function handleResizeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    element: WorkspaceElement,
    handle: ResizeHandle,
  ) {
    const step = event.shiftKey ? 10 : 1;
    const delta = keyboardDelta(event.key, step);
    if (!delta) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBoxDraftChange(element.id, resizeBox(element.bbox, handle, delta.x, delta.y, source));
  }

  function findTopmostHitElement(event: DrawingEvent): WorkspaceElement | null {
    const artboard = artboardRef.current;
    if (!artboard) {
      return null;
    }

    const point = eventPointToImageWithin(event, artboard, source);
    return [...overlayElements]
      .filter((element) => element.visible && pointIsInsideBox(point, element.bbox))
      .sort((left, right) => right.layer - left.layer)[0] ?? null;
  }

  return (
    <div
      ref={artboardRef}
      data-testid="canvas-artboard"
      className="canvas-artboard"
      style={{
        aspectRatio: `${source.width} / ${source.height}`,
        "--source-aspect": source.width / source.height,
      } as CSSProperties}
      onPointerMove={updateBoxEdit}
      onPointerUp={endBoxEdit}
      onPointerCancel={endBoxEdit}
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
      {draftRegion ? (
        <div
          className="draft-inline-editor"
          style={draftEditorStyle(draftRegion.bbox, source)}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="draft-inline-name">
            <span>New element name</span>
            <input
              ref={draftNameInputRef}
              aria-label="New element name"
              type="text"
              defaultValue={manualElementName}
              onChange={(event) => onManualElementNameChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label="Create element"
            onClick={() => onCreateElement(draftNameInputRef.current?.value ?? manualElementName)}
          >
            Create
          </button>
          <button
            type="button"
            aria-label="Create child"
            disabled={!canCreateChildFromDraft}
            onClick={() => onCreateChildElement(draftNameInputRef.current?.value ?? manualElementName)}
          >
            Child
          </button>
        </div>
      ) : null}
      <div className="canvas-interaction-layer">
        {overlayElements.map((element) => {
          if (editingElementId !== element.id) {
            return null;
          }

          return (
            <div
              key={`${element.id}-edit`}
              className="overlay-item overlay-item-edit-controls"
              style={boxToPercentStyle(element.bbox, source)}
            >
              <div
                aria-label={`Edit ${element.name} box`}
                className="canvas-edit-region"
                data-canvas-edit-region="true"
                data-element-id={element.id}
                data-testid={`canvas-edit-region-${element.id}`}
                role="region"
                tabIndex={0}
                onKeyDown={(event) => handleEditKeyDown(event, element)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectElement(element.id);
                  onOpenElementContextMenu(element.id, { x: event.clientX, y: event.clientY });
                }}
                onPointerDown={(event) => beginBoxMove(event, element)}
                onPointerMove={updateBoxEdit}
                onPointerUp={endBoxEdit}
                onPointerCancel={endBoxEdit}
              >
                {RESIZE_HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={`Resize ${element.name} box ${handle}`}
                    className={`resize-handle resize-handle-${handle}`}
                    data-element-id={element.id}
                    data-resize-handle={handle}
                    data-testid={`resize-handle-${element.id}-${handle}`}
                    onKeyDown={(event) => handleResizeKeyDown(event, element, handle)}
                    onPointerDown={(event) => beginBoxResize(event, element, handle)}
                    onPointerMove={updateBoxEdit}
                    onPointerUp={endBoxEdit}
                    onPointerCancel={endBoxEdit}
                  />
                ))}
              </div>
              {hasUnsavedBoxEdit ? (
                <div
                  aria-label={`Confirm ${element.name} box edit`}
                  className="box-edit-confirmation"
                  role="group"
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <span>Box changed</span>
                  <button type="button" onClick={onConfirmBoxEdit}>
                    Apply box edit
                  </button>
                  <button type="button" onClick={onCancelBoxEdit}>
                    Cancel box edit
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {splitRegions.length > 0 ? (
        <div
          aria-label="Split draft controls"
          className="split-inline-controls"
          role="group"
          style={draftEditorStyle(splitRegions[splitRegions.length - 1].bbox, source)}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>{splitRegions.length} region{splitRegions.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={onApplySplit}>
            Apply split regions
          </button>
          <button type="button" onClick={onClearDrafts}>
            Cancel split
          </button>
        </div>
      ) : null}
      <div
        className="canvas-drawing-surface"
        data-testid="canvas-drawing-surface"
        onPointerDown={handleDrawingPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={handleDrawingContextMenu}
        onMouseDown={handleDrawingPointerDown}
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
    typeof event.clientX === "number"
      ? event.clientX
      : typeof nativeEvent?.clientX === "number"
        ? nativeEvent.clientX
        : rect.left;
  const rawClientY =
    typeof event.clientY === "number"
      ? event.clientY
      : typeof nativeEvent?.clientY === "number"
        ? nativeEvent.clientY
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

function normalizeWheelDelta(event: globalThis.WheelEvent): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * 240;
  }
  return event.deltaY;
}

function readGestureScale(event: Event): number {
  const scale = (event as GestureScaleEvent).scale;
  return typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
}

function eventPointToImageWithin(
  event: ClientPositionEvent,
  element: HTMLElement,
  source: SourceMetadata,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const width = rect.width || rect.right - rect.left || source.width || 1;
  const height = rect.height || rect.bottom - rect.top || source.height || 1;
  const rawClientX =
    typeof event.clientX === "number"
      ? event.clientX
      : typeof event.nativeEvent?.clientX === "number"
        ? event.nativeEvent.clientX
        : rect.left;
  const rawClientY =
    typeof event.clientY === "number"
      ? event.clientY
      : typeof event.nativeEvent?.clientY === "number"
        ? event.nativeEvent.clientY
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

function draftEditorStyle(box: Box, source: SourceMetadata): CSSProperties {
  return {
    left: `${(box.x / source.width) * 100}%`,
    top: `${(box.y / source.height) * 100}%`,
  };
}

function keyboardDelta(key: string, step: number): { x: number; y: number } | null {
  if (key === "ArrowLeft") {
    return { x: -step, y: 0 };
  }
  if (key === "ArrowRight") {
    return { x: step, y: 0 };
  }
  if (key === "ArrowUp") {
    return { x: 0, y: -step };
  }
  if (key === "ArrowDown") {
    return { x: 0, y: step };
  }
  return null;
}

function parseResizeHandle(value: string | undefined): ResizeHandle | null {
  return RESIZE_HANDLES.includes(value as ResizeHandle) ? value as ResizeHandle : null;
}

function moveBox(box: Box, deltaX: number, deltaY: number, source: SourceMetadata): Box {
  const width = clamp(Math.round(box.w), 1, source.width);
  const height = clamp(Math.round(box.h), 1, source.height);
  return {
    x: clamp(Math.round(box.x + deltaX), 0, source.width - width),
    y: clamp(Math.round(box.y + deltaY), 0, source.height - height),
    w: width,
    h: height,
  };
}

function resizeBox(
  box: Box,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  source: SourceMetadata,
): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;

  if (handle.includes("w")) {
    left += deltaX;
  }
  if (handle.includes("e")) {
    right += deltaX;
  }
  if (handle.includes("n")) {
    top += deltaY;
  }
  if (handle.includes("s")) {
    bottom += deltaY;
  }

  left = clamp(Math.round(left), 0, source.width - 1);
  top = clamp(Math.round(top), 0, source.height - 1);
  right = clamp(Math.round(right), 1, source.width);
  bottom = clamp(Math.round(bottom), 1, source.height);

  if (right <= left) {
    if (handle.includes("w")) {
      left = Math.max(0, right - 1);
    } else {
      right = Math.min(source.width, left + 1);
    }
  }
  if (bottom <= top) {
    if (handle.includes("n")) {
      top = Math.max(0, bottom - 1);
    } else {
      bottom = Math.min(source.height, top + 1);
    }
  }

  return {
    x: left,
    y: top,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
  };
}

function pointIsInsideBox(point: { x: number; y: number }, box: Box): boolean {
  return (
    point.x >= box.x
    && point.y >= box.y
    && point.x <= box.x + box.w
    && point.y <= box.y + box.h
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
