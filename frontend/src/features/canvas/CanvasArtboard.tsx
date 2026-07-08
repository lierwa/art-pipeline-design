import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, useEffect, useRef } from "react";

import {
  type Box,
  type CanvasTool,
  type DraftRegion,
  type ElementSelectionMode,
  type OverlayState,
  type SourceMetadata,
} from "../../domain/workspace";
import { CanvasBoxEditLayer } from "./CanvasBoxEditLayer";
import { CanvasDraftControls } from "./CanvasDraftControls";
import { CanvasOverlayLayer, type CanvasSelectionOverlayView } from "./CanvasOverlayLayer";
import type { CanvasObjectView, CanvasSurfaceCapabilities } from "../canvasObjects";
import {
  type BoxEditDrag,
  type DrawingEvent,
  type DrawingEventPhase,
  type ResizeHandle,
  boxArea,
  eventPointToImageWithin,
  keyboardDelta,
  moveBox,
  pointIsInsideBox,
  resizeBox,
} from "./canvasStageGeometry";

type BoxEditPointerEvent = {
  clientX?: number;
  clientY?: number;
  nativeEvent?: {
    clientX?: number;
    clientY?: number;
  };
};

export type CanvasHitTestStrategy = "front" | "smallest-on-modified-selection";

export type CanvasArtboardProps = {
  sourceUrl: string;
  source: SourceMetadata;
  overlays: OverlayState;
  canvasObjects: CanvasObjectView[];
  capabilities: CanvasSurfaceCapabilities;
  hitTestStrategy: CanvasHitTestStrategy;
  selectedElementId: string | null;
  selectedElementIds: string[];
  editingElementId: string | null;
  mergePreview: Box | null;
  draftRegion: DraftRegion | null;
  splitRegions: DraftRegion[];
  missingMaskRegion: DraftRegion | null;
  tool: CanvasTool;
  isPanMode: boolean;
  manualElementName: string;
  renamingElementId: string | null;
  selectionOverlays?: CanvasSelectionOverlayView[];
  canCreateChildFromDraft: boolean;
  hasUnsavedBoxEdit: boolean;
  suppressedOverlayLabelIds?: string[];
  onSelectElement: (elementId: string, mode?: ElementSelectionMode) => void;
  onClearSelection: () => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onStartRenameElement: (elementId: string) => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onCancelRenameElement: () => void;
  onBoxDraftChange: (elementId: string, bbox: Box) => void;
  onBoxEditEnd?: (elementId: string) => void;
  onBoxEditStart?: (elementId: string) => void;
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

export function CanvasArtboard({
  sourceUrl,
  source,
  overlays,
  canvasObjects,
  capabilities,
  hitTestStrategy,
  selectedElementId,
  selectedElementIds,
  editingElementId,
  mergePreview,
  draftRegion,
  splitRegions,
  missingMaskRegion,
  tool,
  isPanMode,
  manualElementName,
  renamingElementId,
  selectionOverlays,
  canCreateChildFromDraft,
  hasUnsavedBoxEdit,
  suppressedOverlayLabelIds,
  onSelectElement,
  onClearSelection,
  onOpenElementContextMenu,
  onStartRenameElement,
  onCommitRenameElement,
  onCancelRenameElement,
  onBoxDraftChange,
  onBoxEditEnd,
  onBoxEditStart,
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
  const lastPointerDrawingEventRef = useRef<{
    phase: DrawingEventPhase;
    clientX: number;
    clientY: number;
    at: number;
  } | null>(null);

  function handleDrawingPointerDown(event: DrawingEvent) {
    if (shouldIgnoreMouseFallbackEvent(event, "down")) {
      return;
    }
    if (isPanMode) {
      return;
    }
    if (tool === "select") {
      const isMergeToggle = event.shiftKey || event.ctrlKey || event.metaKey;
      const hitObject = findHitObject(event, resolveSelectionHitStrategy(isMergeToggle));
      if (!hitObject) {
        if (!isMergeToggle && (selectedElementId || selectedElementIds.length > 0)) {
          onClearSelection();
        }
        return;
      }
      if (isMergeToggle) {
        onSelectElement(hitObject.id, "toggle");
      } else {
        onSelectElement(hitObject.id, "replace");
      }
      return;
    }

    onPointerDown(event);
  }

  function handleDrawingPointerMove(event: DrawingEvent) {
    if (shouldIgnoreMouseFallbackEvent(event, "move")) {
      return;
    }
    onPointerMove(event);
  }

  function handleDrawingPointerUp(event: DrawingEvent) {
    if (shouldIgnoreMouseFallbackEvent(event, "up")) {
      return;
    }
    onPointerUp(event);
  }

  function handleDrawingContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (isPanMode || tool !== "select") {
      return;
    }

    const hitObject = findHitObject(event, resolveContextMenuHitStrategy());
    if (!hitObject) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const shouldPreserveSelection =
      selectedElementIds.length > 1
      || (selectedElementIds.length > 0 && !selectedElementIds.includes(hitObject.id));
    onSelectElement(
      hitObject.id,
      shouldPreserveSelection ? "focus" : "replace",
    );
    onOpenElementContextMenu(hitObject.id, { x: event.clientX, y: event.clientY });
  }

  function shouldIgnoreMouseFallbackEvent(event: DrawingEvent, phase: DrawingEventPhase): boolean {
    if (event.type.startsWith("pointer")) {
      lastPointerDrawingEventRef.current = {
        phase,
        clientX: event.clientX,
        clientY: event.clientY,
        at: Date.now(),
      };
      return false;
    }

    if (!event.type.startsWith("mouse")) {
      return false;
    }

    const lastPointerEvent = lastPointerDrawingEventRef.current;
    return Boolean(
      lastPointerEvent
        && lastPointerEvent.phase === phase
        && Date.now() - lastPointerEvent.at < 500
        && Math.abs(lastPointerEvent.clientX - event.clientX) < 1
        && Math.abs(lastPointerEvent.clientY - event.clientY) < 1,
    );
  }

  useEffect(() => {
    const artboard = artboardRef.current;
    if (!artboard) {
      return undefined;
    }

    function handleNativePointerMove(event: globalThis.PointerEvent) {
      if (!boxEditDragRef.current) {
        return;
      }

      event.preventDefault();
      updateBoxEditFromPointer(event);
    }

    function handleNativePointerEnd(event: globalThis.PointerEvent) {
      if (!boxEditDragRef.current) {
        return;
      }

      event.preventDefault();
      finishBoxEditDrag();
    }

    artboard.addEventListener("pointermove", handleNativePointerMove);
    artboard.addEventListener("pointerup", handleNativePointerEnd);
    artboard.addEventListener("pointercancel", handleNativePointerEnd);
    artboard.ownerDocument.addEventListener("pointermove", handleNativePointerMove);
    artboard.ownerDocument.addEventListener("pointerup", handleNativePointerEnd);
    artboard.ownerDocument.addEventListener("pointercancel", handleNativePointerEnd);

    return () => {
      artboard.removeEventListener("pointermove", handleNativePointerMove);
      artboard.removeEventListener("pointerup", handleNativePointerEnd);
      artboard.removeEventListener("pointercancel", handleNativePointerEnd);
      artboard.ownerDocument.removeEventListener("pointermove", handleNativePointerMove);
      artboard.ownerDocument.removeEventListener("pointerup", handleNativePointerEnd);
      artboard.ownerDocument.removeEventListener("pointercancel", handleNativePointerEnd);
    };
  }, [canvasObjects, onBoxDraftChange, onBoxEditEnd, onBoxEditStart, onSelectElement, source]);

  function startBoxEditDrag(
    event: BoxEditPointerEvent,
    object: CanvasObjectView,
    mode: BoxEditDrag["mode"],
    handle: ResizeHandle | null,
  ) {
    const artboard = artboardRef.current;
    if (!artboard) {
      return;
    }

    const point = pointFromPointerEvent(
      event,
      artboard,
      source,
      mode === "rotate" ? rotateHandleStartPoint(object.box) : null,
    );
    boxEditDragRef.current = {
      elementId: object.id,
      mode,
      handle,
      startX: point.x,
      startY: point.y,
      startBox: object.box,
      startAngleDeg: angleFromBoxCenter(point, object.box),
      startRotationDeg: object.box.rotationDeg ?? 0,
    };
    onBoxEditStart?.(object.id);
    onSelectElement(object.id);
  }

  function finishBoxEditDrag() {
    const drag = boxEditDragRef.current;
    if (!drag) {
      return;
    }
    boxEditDragRef.current = null;
    onBoxEditEnd?.(drag.elementId);
  }

  function beginBoxMove(event: PointerEvent<HTMLDivElement>, object: CanvasObjectView) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startBoxEditDrag(event, object, "move", null);
  }

  function beginBoxResize(
    event: PointerEvent<HTMLButtonElement>,
    object: CanvasObjectView,
    handle: ResizeHandle,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startBoxEditDrag(event, object, "resize", handle);
  }

  function beginBoxRotate(event: PointerEvent<HTMLButtonElement>, object: CanvasObjectView) {
    if (!capabilities.canRotateObjects) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startBoxEditDrag(event, object, "rotate", null);
  }

  function updateBoxEditFromPointer(event: BoxEditPointerEvent) {
    const drag = boxEditDragRef.current;
    const artboard = artboardRef.current;
    if (!drag || !artboard) {
      return;
    }

    const point = pointFromPointerEvent(
      event,
      artboard,
      source,
      drag.mode === "rotate" ? rotateHandleFallbackMovePoint(drag.startBox) : null,
    );
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;
    const nextBox = nextBoxForEditDrag(drag, point, deltaX, deltaY, source);
    onBoxDraftChange(drag.elementId, nextBox);
  }

  function updateBoxEdit(event: PointerEvent<HTMLElement>) {
    if (!boxEditDragRef.current) {
      return;
    }

    event.preventDefault();
    updateBoxEditFromPointer(event);
  }

  function endBoxEdit(event: PointerEvent<HTMLElement>) {
    if (!boxEditDragRef.current) {
      return;
    }

    event.preventDefault();
    finishBoxEditDrag();
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLDivElement>, object: CanvasObjectView) {
    const step = event.shiftKey ? 10 : 1;
    const delta = keyboardDelta(event.key, step);
    if (!delta) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBoxDraftChange(object.id, moveBox(object.box, delta.x, delta.y, source));
  }

  function handleResizeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    object: CanvasObjectView,
    handle: ResizeHandle,
  ) {
    const step = event.shiftKey ? 10 : 1;
    const delta = keyboardDelta(event.key, step);
    if (!delta) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onBoxDraftChange(object.id, resizeBox(object.box, handle, delta.x, delta.y, source));
  }

  function findHitObject(event: DrawingEvent, strategy: "front" | "smallest"): CanvasObjectView | null {
    const artboard = artboardRef.current;
    if (!artboard) {
      return null;
    }

    const point = eventPointToImageWithin(event, artboard, source);
    const layerOrder = new Map(canvasObjects.map((object, index) => [object.id, index]));
    return [...canvasObjects]
      .filter((object) => object.isVisible && pointIsInsideBox(point, object.box))
      .sort((left, right) => {
        if (strategy === "smallest") {
          const areaDelta = boxArea(left.box) - boxArea(right.box);
          if (areaDelta !== 0) {
            return areaDelta;
          }
        }
        return (layerOrder.get(right.id) ?? 0) - (layerOrder.get(left.id) ?? 0);
      })[0] ?? null;
  }

  function resolveSelectionHitStrategy(isModifiedSelection: boolean): "front" | "smallest" {
    if (hitTestStrategy === "front") {
      return "front";
    }
    return isModifiedSelection ? "smallest" : "front";
  }

  function resolveContextMenuHitStrategy(): "front" | "smallest" {
    return hitTestStrategy === "front" ? "front" : "smallest";
  }

  // WHY: capability 关闭时仍可能收到上层残留草稿状态；共享画布层必须在渲染边界收窄，避免非 pipeline surface 暴露创建/拆分/补 mask 操作。
  const visibleDraftRegion = capabilities.canDraw ? draftRegion : null;
  const visibleSplitRegions = capabilities.canSplit ? splitRegions : [];
  const visibleMissingMaskRegion = capabilities.canUseMissingMask ? missingMaskRegion : null;

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
      <CanvasOverlayLayer
        canvasObjects={canvasObjects}
        capabilities={capabilities}
        draftRegion={visibleDraftRegion}
        editingElementId={editingElementId}
        mergePreview={mergePreview}
        missingMaskRegion={visibleMissingMaskRegion}
        overlays={overlays}
        renamingElementId={renamingElementId}
        selectionOverlays={selectionOverlays}
        selectedElementId={selectedElementId}
        selectedElementIds={selectedElementIds}
        source={source}
        splitRegions={visibleSplitRegions}
        suppressedLabelIds={suppressedOverlayLabelIds}
        onCancelRenameElement={onCancelRenameElement}
        onCommitRenameElement={onCommitRenameElement}
        onSelectElement={onSelectElement}
        onStartRenameElement={onStartRenameElement}
      />
      <CanvasDraftControls
        canCreateChildFromDraft={capabilities.canCreateChild && canCreateChildFromDraft}
        draftRegion={visibleDraftRegion}
        manualElementName={manualElementName}
        source={source}
        splitRegions={visibleSplitRegions}
        onApplySplit={onApplySplit}
        onClearDrafts={onClearDrafts}
        onCreateChildElement={onCreateChildElement}
        onCreateElement={onCreateElement}
        onManualElementNameChange={onManualElementNameChange}
      />
      <CanvasBoxEditLayer
        canvasObjects={canvasObjects}
        canRotateObjects={capabilities.canRotateObjects}
        editingElementId={editingElementId}
        hasUnsavedBoxEdit={hasUnsavedBoxEdit}
        source={source}
        onBeginBoxMove={beginBoxMove}
        onBeginBoxResize={beginBoxResize}
        onBeginBoxRotate={beginBoxRotate}
        onCancelBoxEdit={onCancelBoxEdit}
        onConfirmBoxEdit={onConfirmBoxEdit}
        onEditKeyDown={handleEditKeyDown}
        onEndBoxEdit={endBoxEdit}
        onOpenElementContextMenu={onOpenElementContextMenu}
        onResizeKeyDown={handleResizeKeyDown}
        onSelectElement={onSelectElement}
        onUpdateBoxEdit={updateBoxEdit}
      />
      <div
        className="canvas-drawing-surface"
        data-testid="canvas-drawing-surface"
        onPointerDown={handleDrawingPointerDown}
        onPointerMove={handleDrawingPointerMove}
        onPointerUp={handleDrawingPointerUp}
        onContextMenu={handleDrawingContextMenu}
        onMouseDown={handleDrawingPointerDown}
        onMouseMove={handleDrawingPointerMove}
        onMouseUp={handleDrawingPointerUp}
      />
    </div>
  );
}

function nextBoxForEditDrag(
  drag: BoxEditDrag,
  point: { x: number; y: number },
  deltaX: number,
  deltaY: number,
  source: CanvasArtboardProps["source"],
) {
  if (drag.mode === "move") {
    return moveBox(drag.startBox, deltaX, deltaY, source);
  }
  if (drag.mode === "resize") {
    return resizeBox(drag.startBox, drag.handle ?? "se", deltaX, deltaY, source);
  }
  return {
    ...drag.startBox,
    rotationDeg: normalizeRotationDeg(
      drag.startRotationDeg + angleFromBoxCenter(point, drag.startBox) - drag.startAngleDeg,
    ),
  };
}

function angleFromBoxCenter(point: { x: number; y: number }, box: Box & { rotationDeg?: number }) {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  return Math.atan2(point.y - centerY, point.x - centerX) * 180 / Math.PI;
}

function pointFromPointerEvent(
  event: BoxEditPointerEvent,
  artboard: HTMLElement,
  source: SourceMetadata,
  fallbackPoint: { x: number; y: number } | null,
) {
  if (hasPointerCoordinates(event)) {
    return eventPointToImageWithin(event, artboard, source);
  }
  return fallbackPoint ?? eventPointToImageWithin(event, artboard, source);
}

function hasPointerCoordinates(event: BoxEditPointerEvent) {
  return (
    typeof event.clientX === "number"
    || typeof event.clientY === "number"
    || typeof event.nativeEvent?.clientX === "number"
    || typeof event.nativeEvent?.clientY === "number"
  );
}

function rotateHandleStartPoint(box: Box & { rotationDeg?: number }) {
  return {
    x: box.x + box.w / 2,
    y: box.y,
  };
}

function rotateHandleFallbackMovePoint(box: Box & { rotationDeg?: number }) {
  return {
    x: box.x + box.w,
    y: box.y + box.h / 2,
  };
}

function normalizeRotationDeg(value: number) {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Math.round(normalized);
}
