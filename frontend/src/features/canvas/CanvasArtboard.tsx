import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, useEffect, useRef } from "react";

import {
  type Box,
  type CanvasTool,
  type DraftRegion,
  type ElementSelectionMode,
  type OverlayState,
  type SourceMetadata,
  type WorkspaceElement,
} from "../../domain/workspace";
import { CanvasBoxEditLayer } from "./CanvasBoxEditLayer";
import { CanvasDraftControls } from "./CanvasDraftControls";
import { CanvasOverlayLayer } from "./CanvasOverlayLayer";
import {
  type BoxEditDrag,
  type DrawingEvent,
  type DrawingEventPhase,
  type ResizeHandle,
  boxArea,
  eventPointToImageWithin,
  keyboardDelta,
  moveBox,
  parseResizeHandle,
  pointIsInsideBox,
  resizeBox,
} from "./canvasStageGeometry";

export type CanvasArtboardProps = {
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
  renamingElementId: string | null;
  canCreateChildFromDraft: boolean;
  hasUnsavedBoxEdit: boolean;
  onSelectElement: (elementId: string, mode?: ElementSelectionMode) => void;
  onClearSelection: () => void;
  onOpenElementContextMenu: (elementId: string, position: { x: number; y: number }) => void;
  onStartRenameElement: (elementId: string) => void;
  onCommitRenameElement: (elementId: string, name: string) => void;
  onCancelRenameElement: () => void;
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

export function CanvasArtboard({
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
  renamingElementId,
  canCreateChildFromDraft,
  hasUnsavedBoxEdit,
  onSelectElement,
  onClearSelection,
  onOpenElementContextMenu,
  onStartRenameElement,
  onCommitRenameElement,
  onCancelRenameElement,
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
      const hitElement = findHitElement(event, isMergeToggle ? "smallest" : "front");
      if (!hitElement) {
        if (!isMergeToggle && (selectedElementId || selectedElementIds.length > 0)) {
          onClearSelection();
        }
        return;
      }
      if (isMergeToggle) {
        onSelectElement(hitElement.id, "toggle");
      } else {
        onSelectElement(hitElement.id, "replace");
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

    const hitElement = findHitElement(event, "smallest");
    if (!hitElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const shouldPreserveSelection =
      selectedElementIds.length > 1
      || (selectedElementIds.length > 0 && !selectedElementIds.includes(hitElement.id));
    onSelectElement(
      hitElement.id,
      shouldPreserveSelection ? "focus" : "replace",
    );
    onOpenElementContextMenu(hitElement.id, { x: event.clientX, y: event.clientY });
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

  function findHitElement(event: DrawingEvent, strategy: "front" | "smallest"): WorkspaceElement | null {
    const artboard = artboardRef.current;
    if (!artboard) {
      return null;
    }

    const point = eventPointToImageWithin(event, artboard, source);
    return [...overlayElements]
      .filter((element) => element.visible && pointIsInsideBox(point, element.bbox))
      .sort((left, right) => {
        if (strategy === "smallest") {
          const areaDelta = boxArea(left.bbox) - boxArea(right.bbox);
          if (areaDelta !== 0) {
            return areaDelta;
          }
        }
        return right.layer - left.layer;
      })[0] ?? null;
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
      <CanvasOverlayLayer
        assetCacheKey={assetCacheKey}
        draftRegion={draftRegion}
        editingElementId={editingElementId}
        mergePreview={mergePreview}
        missingMaskRegion={missingMaskRegion}
        overlayElements={overlayElements}
        overlays={overlays}
        renamingElementId={renamingElementId}
        selectedElementId={selectedElementId}
        selectedElementIds={selectedElementIds}
        source={source}
        splitRegions={splitRegions}
        workspaceRunId={workspaceRunId}
        onCancelRenameElement={onCancelRenameElement}
        onCommitRenameElement={onCommitRenameElement}
        onSelectElement={onSelectElement}
        onStartRenameElement={onStartRenameElement}
      />
      <CanvasDraftControls
        canCreateChildFromDraft={canCreateChildFromDraft}
        draftRegion={draftRegion}
        manualElementName={manualElementName}
        source={source}
        splitRegions={splitRegions}
        onApplySplit={onApplySplit}
        onClearDrafts={onClearDrafts}
        onCreateChildElement={onCreateChildElement}
        onCreateElement={onCreateElement}
        onManualElementNameChange={onManualElementNameChange}
      />
      <CanvasBoxEditLayer
        editingElementId={editingElementId}
        hasUnsavedBoxEdit={hasUnsavedBoxEdit}
        overlayElements={overlayElements}
        source={source}
        onBeginBoxMove={beginBoxMove}
        onBeginBoxResize={beginBoxResize}
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
