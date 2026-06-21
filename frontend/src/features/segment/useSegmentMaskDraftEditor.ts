import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";

import { normalizeWheelDelta, readGestureScale } from "../canvas/canvasStageGeometry";
import { isEditableShortcutTarget } from "../../app/keyboardShortcuts";
import type { Box, WorkspaceElement } from "../../domain/workspace";
import type { MaskEditTool, MaskToolDock } from "./SegmentMaskReviewParts";
import { DEFAULT_PALETTE_SNAP } from "../../shared/hooks/useDockedPalette";
import {
  buildBackgroundMaskOverlayDataUrl,
  buildBrushSelection,
  buildSelectionOverlayDataUrl,
  buildStickerPreviewDataUrl,
  canvasToDataUrl,
  drawBrushIntoDraft,
  floodFillSelection,
  getCanvas2dContext,
  mergeSelectionIntoDraft,
  readCanvasPointFromFrame,
  removeSmallDraftFragments,
  thresholdMaskCanvas,
  type CanvasPoint,
  type MaskViewTransform,
} from "./segmentMaskDraft";

export type SegmentMaskPatchRequest = {
  operation?: "replace" | "add" | "subtract";
  shape:
    | {
      type: "rectangle";
      coordinateSpace: "canvas";
      bbox: Box;
    }
    | {
      type: "magic_wand";
      coordinateSpace: "canvas";
      seed: CanvasPoint;
      tolerance: number;
    }
    | {
      type: "mask_delta";
      coordinateSpace: "canvas";
      maskData: string;
      cleanupMinArea?: number;
    };
};

export type SegmentDraftHistoryStatus = {
  canUndo: boolean;
  canRedo: boolean;
  hasDirtyDraft: boolean;
};

export type SegmentEdgeBoardHandle = {
  undoDraft: () => boolean;
  redoDraft: () => boolean;
  clearDraftHistory: () => void;
};

export type DraftMaskState = {
  maskDataUrl: string;
  displayOverlayDataUrl: string;
  stickerDataUrl: string | null;
  selectionDataUrl: string | null;
  selectionOperation: "add" | "subtract" | null;
  dirty: boolean;
  cursor: CanvasPoint | null;
};

type MaskDraftSnapshot = {
  draftMask: DraftMaskState | null;
  canvas: HTMLCanvasElement | null;
};

const DEFAULT_SOURCE_VIEW: MaskViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
const DEFAULT_DRAFT_HISTORY_STATUS: SegmentDraftHistoryStatus = {
  canUndo: false,
  canRedo: false,
  hasDirtyDraft: false,
};
const DRAFT_HISTORY_LIMIT = 30;
export const SOURCE_VIEW_SCALE_STEP = 1.25;
const SOURCE_VIEW_MIN_SCALE = 1;
const SOURCE_VIEW_MAX_SCALE = 4;
const SOURCE_VIEW_WHEEL_SENSITIVITY = 0.0005;
const SOURCE_VIEW_GESTURE_SENSITIVITY = 0.75;

export function useSegmentMaskDraftEditor({
  activeElement,
  activeTool,
  brushSize,
  canPatchMask,
  maskImageRef,
  onDraftHistoryChange,
  onPatchMask,
  sourceImageRef,
  wandTolerance,
}: {
  activeElement: WorkspaceElement;
  activeTool: MaskEditTool | null;
  brushSize: number;
  canPatchMask: boolean;
  maskImageRef: RefObject<HTMLImageElement | null>;
  onDraftHistoryChange?: (status: SegmentDraftHistoryStatus) => void;
  onPatchMask?: (elementId: string, patch: SegmentMaskPatchRequest) => boolean | void | Promise<boolean | void>;
  sourceImageRef: RefObject<HTMLImageElement | null>;
  wandTolerance: number;
}) {
  const [draftMask, setDraftMask] = useState<DraftMaskState | null>(null);
  const [maskDisplayOverlaySrc, setMaskDisplayOverlaySrc] = useState<string | null>(null);
  const [isBrushDragging, setIsBrushDragging] = useState(false);
  const [sourceViewTransform, setSourceViewTransform] = useState<MaskViewTransform>(DEFAULT_SOURCE_VIEW);
  const [toolDock, setToolDock] = useState<MaskToolDock>(DEFAULT_PALETTE_SNAP);
  const [cursorPoint, setCursorPoint] = useState<CanvasPoint | null>(null);
  const [historyStatus, setHistoryStatus] = useState<SegmentDraftHistoryStatus>(DEFAULT_DRAFT_HISTORY_STATUS);
  const draftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<{ past: MaskDraftSnapshot[]; future: MaskDraftSnapshot[] }>({
    past: [],
    future: [],
  });
  const isBrushDraggingRef = useRef(false);
  const brushStrokeStartRef = useRef<MaskDraftSnapshot | null>(null);
  const gestureScaleRef = useRef(1);
  const isSourcePanningRef = useRef(false);
  const isSpacePanningRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; transform: MaskViewTransform } | null>(null);
  const submitQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setDraftMask(null);
    setMaskDisplayOverlaySrc(null);
    setIsBrushDragging(false);
    setCursorPoint(null);
    setSourceViewTransform(DEFAULT_SOURCE_VIEW);
    isBrushDraggingRef.current = false;
    brushStrokeStartRef.current = null;
    isSourcePanningRef.current = false;
    panStartRef.current = null;
    draftCanvasRef.current = null;
    historyRef.current = { past: [], future: [] };
    setHistoryStatus(DEFAULT_DRAFT_HISTORY_STATUS);
  }, [activeElement.id]);

  useEffect(() => {
    onDraftHistoryChange?.(historyStatus);
  }, [historyStatus, onDraftHistoryChange]);

  useEffect(() => {
    if (!activeTool) {
      setCursorPoint(null);
    }
  }, [activeTool]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.code === "Space" && !isEditableShortcutTarget(event.target)) {
        isSpacePanningRef.current = true;
      }
    }
    function handleKeyUp(event: globalThis.KeyboardEvent) {
      if (event.code === "Space") {
        isSpacePanningRef.current = false;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  function handleSourceClick(event: MouseEvent<HTMLDivElement>) {
    if (!canPatchMask || !activeTool?.startsWith("wand-") || isToolEventTarget(event.target)) {
      return;
    }
    const point = readSourcePoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const before = currentDraftSnapshot(true);
    const canvas = applyMagicWandDraft(point, activeTool === "wand-add" ? "add" : "subtract");
    commitMaskOperation(canvas, before);
  }

  function handleSourcePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (shouldStartSourcePan(event, isSpacePanningRef.current)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      isSourcePanningRef.current = true;
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        transform: sourceViewTransform,
      };
      return;
    }
    if (!canPatchMask || !activeTool?.startsWith("brush-") || isToolEventTarget(event.target)) {
      return;
    }
    const point = readSourcePoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) {
      return;
    }
    setCursorPoint(point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsBrushDragging(true);
    isBrushDraggingRef.current = true;
    brushStrokeStartRef.current = currentDraftSnapshot(true);
    paintBrushDraft(point, activeTool === "brush-add" ? "add" : "subtract");
  }

  function handleSourcePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isSourcePanningRef.current && panStartRef.current) {
      event.preventDefault();
      const start = panStartRef.current;
      setSourceViewTransform({
        ...start.transform,
        offsetX: start.transform.offsetX + event.clientX - start.clientX,
        offsetY: start.transform.offsetY + event.clientY - start.clientY,
      });
      return;
    }
    if (!canPatchMask || !activeTool) {
      return;
    }
    const point = readSourcePoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) {
      setCursorPoint(null);
      return;
    }
    setCursorPoint(point);
    if (!activeTool.startsWith("brush-")) {
      return;
    }
    if (!isBrushDraggingRef.current) {
      return;
    }
    paintBrushDraft(point, activeTool === "brush-add" ? "add" : "subtract");
  }

  function handleSourcePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (isSourcePanningRef.current) {
      isSourcePanningRef.current = false;
      panStartRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (!isBrushDraggingRef.current && !isBrushDragging) {
      return;
    }
    setIsBrushDragging(false);
    isBrushDraggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (brushStrokeStartRef.current) {
      const before = brushStrokeStartRef.current;
      brushStrokeStartRef.current = null;
      commitMaskOperation(draftCanvasRef.current, before);
    }
  }

  function handleSourceWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    zoomSourceViewByDelta(-normalizeWheelDelta(event.nativeEvent as globalThis.WheelEvent) * SOURCE_VIEW_WHEEL_SENSITIVITY);
  }

  function refreshMaskDisplayOverlay() {
    const image = maskImageRef.current;
    if (image) {
      setMaskDisplayOverlaySrc(buildBackgroundMaskOverlayDataUrl(image, activeElement.canvas));
    }
  }

  function cleanDraftFragments() {
    const before = currentDraftSnapshot(true);
    const canvas = ensureDraftCanvas();
    const context = getCanvas2dContext(canvas);
    if (!context) {
      updateDraftFromCanvas(canvas, null, null);
      return;
    }
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    removeSmallDraftFragments(imageData, Math.max(4, Math.round(canvas.width * canvas.height * 0.0025)));
    context.putImageData(imageData, 0, 0);
    updateDraftFromCanvas(canvas, null, null);
    commitMaskOperation(canvas, before);
  }

  function clearDraftHistory() {
    setDraftMask(null);
    draftCanvasRef.current = null;
    setCursorPoint(null);
    historyRef.current = { past: [], future: [] };
    publishHistoryStatus(false);
  }

  function zoomSourceView(factor: number) {
    setSourceViewTransform((current) => clampSourceView({
      ...current,
      scale: current.scale * factor,
    }));
  }

  function zoomSourceViewByDelta(delta: number) {
    setSourceViewTransform((current) => clampSourceView({
      ...current,
      scale: current.scale + delta,
    }));
  }

  function handleSourceGestureStart(event: Event) {
    event.preventDefault();
    gestureScaleRef.current = readGestureScale(event) ?? 1;
  }

  function handleSourceGestureChange(event: Event) {
    event.preventDefault();
    const nextScale = readGestureScale(event) ?? gestureScaleRef.current;
    const delta = (nextScale - gestureScaleRef.current) * SOURCE_VIEW_GESTURE_SENSITIVITY;
    gestureScaleRef.current = nextScale;
    zoomSourceViewByDelta(delta);
  }

  function handleSourceGestureEnd(event: Event) {
    event.preventDefault();
    gestureScaleRef.current = 1;
  }

  function fitSourceView() {
    setSourceViewTransform(DEFAULT_SOURCE_VIEW);
  }

  function readSourcePoint(frame: HTMLDivElement, clientX: number, clientY: number): CanvasPoint | null {
    return readCanvasPointFromFrame(frame, clientX, clientY, activeElement.canvas, sourceViewTransform);
  }

  function applyMagicWandDraft(point: CanvasPoint, operation: "add" | "subtract"): HTMLCanvasElement {
    const canvas = ensureDraftCanvas();
    const selection = buildMagicWandSelection(point)
      ?? buildBrushSelection(point, Math.max(4, Math.round(brushSize / 2)), canvas.width, canvas.height);
    mergeSelectionIntoDraft(canvas, selection, operation);
    updateDraftFromCanvas(canvas, selection, null, operation);
    return canvas;
  }

  function paintBrushDraft(point: CanvasPoint, operation: "add" | "subtract") {
    const canvas = ensureDraftCanvas();
    drawBrushIntoDraft(canvas, point, brushSize, operation);
    updateDraftFromCanvas(canvas, buildBrushSelection(point, brushSize, canvas.width, canvas.height), point, operation);
  }

  function commitMaskOperation(canvas: HTMLCanvasElement | null, before: MaskDraftSnapshot) {
    if (!canvas || !before.canvas) {
      return;
    }
    pushPastSnapshot(before);
    historyRef.current.future = [];
    // WHY: Segment 画笔/魔棒结束后会立即自动保存；快捷键撤销应由 workspace history
    // 接管。这里保留本地快照给失败回滚/组件级测试，但不再把它标成待处理草稿。
    publishHistoryStatus(false);
    queueMaskSubmit(canvas, before, { rollbackLastHistory: true });
  }

  function queueMaskSubmit(
    canvas: HTMLCanvasElement | null,
    before: MaskDraftSnapshot,
    options: { rollbackLastHistory?: boolean } = {},
  ) {
    if (!canvas || !onPatchMask) {
      return;
    }
    const elementId = activeElement.id;
    const maskData = canvasToDataUrl(canvas);
    submitQueueRef.current = submitQueueRef.current.then(async () => {
      const ok = await submitMaskData(elementId, maskData);
      if (!ok) {
        if (options.rollbackLastHistory) {
          historyRef.current.past.pop();
        }
        restoreDraftSnapshot(before);
        publishHistoryStatus(false);
        return;
      }
      // WHY: 自动保存成功后，后端 workspace state 才是权威 mask。继续保留本地 draft
      // 会让全局 undo/redo 后仍看到旧草稿覆盖层，和资源状态脱节。
      draftCanvasRef.current = null;
      setDraftMask(null);
      publishHistoryStatus(false);
    });
  }

  async function submitMaskData(elementId: string, maskData: string): Promise<boolean> {
    try {
      const result = await onPatchMask?.(elementId, {
        operation: "replace",
        shape: {
          type: "mask_delta",
          coordinateSpace: "canvas",
          maskData,
        },
      });
      return result !== false;
    } catch {
      return false;
    }
  }

  function ensureDraftCanvas(): HTMLCanvasElement {
    const canvas = draftCanvasRef.current ?? document.createElement("canvas");
    if (canvas.width !== activeElement.canvas.w || canvas.height !== activeElement.canvas.h) {
      canvas.width = activeElement.canvas.w;
      canvas.height = activeElement.canvas.h;
      const context = getCanvas2dContext(canvas);
      context?.clearRect(0, 0, canvas.width, canvas.height);
      const image = maskImageRef.current;
      if (context && image?.complete && image.naturalWidth > 0) {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        thresholdMaskCanvas(canvas);
      }
    }
    draftCanvasRef.current = canvas;
    return canvas;
  }

  function updateDraftFromCanvas(
    canvas: HTMLCanvasElement,
    selection: HTMLCanvasElement | null,
    cursor: CanvasPoint | null,
    operation: "add" | "subtract" | null = null,
  ) {
    setDraftMask({
      maskDataUrl: canvasToDataUrl(canvas),
      displayOverlayDataUrl: buildBackgroundMaskOverlayDataUrl(canvas),
      stickerDataUrl: buildStickerPreviewDataUrl(sourceImageRef.current, canvas),
      selectionDataUrl: selection && operation ? buildSelectionOverlayDataUrl(selection, operation) : null,
      selectionOperation: operation,
      dirty: true,
      cursor: cursor ?? (selection ? null : cursorPoint),
    });
  }

  function buildMagicWandSelection(point: CanvasPoint): HTMLCanvasElement | null {
    const image = sourceImageRef.current;
    if (!image?.complete || image.naturalWidth <= 0) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = activeElement.canvas.w;
    canvas.height = activeElement.canvas.h;
    const context = getCanvas2dContext(canvas);
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const sourceData = context.getImageData(0, 0, canvas.width, canvas.height);
    const selectionData = context.createImageData(canvas.width, canvas.height);
    floodFillSelection(sourceData, selectionData, point, wandTolerance);
    context.putImageData(selectionData, 0, 0);
    return canvas;
  }

  function currentDraftSnapshot(ensureCanvas = false): MaskDraftSnapshot {
    const canvas = ensureCanvas ? ensureDraftCanvas() : draftCanvasRef.current;
    return {
      draftMask: draftMask ? { ...draftMask } : null,
      canvas: cloneCanvas(canvas),
    };
  }

  function restoreDraftSnapshot(snapshot: MaskDraftSnapshot, dirty = false) {
    const restoredCanvas = cloneCanvas(snapshot.canvas);
    draftCanvasRef.current = restoredCanvas;
    if (restoredCanvas) {
      setDraftMask(buildDraftStateFromCanvas(restoredCanvas, dirty));
      return;
    }
    setDraftMask(snapshot.draftMask ? { ...snapshot.draftMask, dirty } : null);
  }

  function undoDraft(): boolean {
    const target = historyRef.current.past.pop();
    if (!target?.canvas) {
      publishHistoryStatus(Boolean(draftMask?.dirty));
      return false;
    }
    const current = currentDraftSnapshot(true);
    if (current.canvas) {
      pushFutureSnapshot(current);
    }
    restoreDraftSnapshot(target, true);
    publishHistoryStatus(true);
    queueMaskSubmit(target.canvas, current);
    return true;
  }

  function redoDraft(): boolean {
    const target = historyRef.current.future.pop();
    if (!target?.canvas) {
      publishHistoryStatus(Boolean(draftMask?.dirty));
      return false;
    }
    const current = currentDraftSnapshot(true);
    if (current.canvas) {
      pushPastSnapshot(current);
    }
    restoreDraftSnapshot(target, true);
    publishHistoryStatus(true);
    queueMaskSubmit(target.canvas, current);
    return true;
  }

  function pushPastSnapshot(snapshot: MaskDraftSnapshot) {
    historyRef.current.past = [...historyRef.current.past, snapshot].slice(-DRAFT_HISTORY_LIMIT);
  }

  function pushFutureSnapshot(snapshot: MaskDraftSnapshot) {
    historyRef.current.future = [...historyRef.current.future, snapshot].slice(-DRAFT_HISTORY_LIMIT);
  }

  function publishHistoryStatus(hasDirtyDraft: boolean) {
    setHistoryStatus({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
      hasDirtyDraft,
    });
  }

  function buildDraftStateFromCanvas(canvas: HTMLCanvasElement, dirty: boolean): DraftMaskState {
    return {
      maskDataUrl: canvasToDataUrl(canvas),
      displayOverlayDataUrl: buildBackgroundMaskOverlayDataUrl(canvas),
      stickerDataUrl: buildStickerPreviewDataUrl(sourceImageRef.current, canvas),
      selectionDataUrl: null,
      selectionOperation: null,
      dirty,
      cursor: null,
    };
  }

  return {
    brushCursor: activeTool ? cursorPoint ?? draftMask?.cursor ?? null : null,
    cleanDraftFragments,
    draftMask,
    fitSourceView,
    handleSourceClick,
    handleSourceGestureChange,
    handleSourceGestureEnd,
    handleSourceGestureStart,
    handleSourcePointerDown,
    handleSourcePointerMove,
    handleSourcePointerUp,
    handleSourceWheel,
    maskDisplayOverlaySrc,
    refreshMaskDisplayOverlay,
    setToolDock,
    sourceViewTransform,
    toolDock,
    undoDraft,
    redoDraft,
    clearDraftHistory,
    zoomSourceView,
  };
}

function shouldStartSourcePan(event: PointerEvent<HTMLDivElement>, isSpacePanning: boolean): boolean {
  return event.button === 1 || event.buttons === 4 || isSpacePanning;
}

function cloneCanvas(canvas: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!canvas) {
    return null;
  }
  const clone = document.createElement("canvas");
  clone.width = canvas.width;
  clone.height = canvas.height;
  getCanvas2dContext(clone)?.drawImage(canvas, 0, 0);
  return clone;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampSourceView(transform: MaskViewTransform): MaskViewTransform {
  return {
    ...transform,
    scale: clampNumber(transform.scale, SOURCE_VIEW_MIN_SCALE, SOURCE_VIEW_MAX_SCALE),
  };
}

function isToolEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button"));
}
