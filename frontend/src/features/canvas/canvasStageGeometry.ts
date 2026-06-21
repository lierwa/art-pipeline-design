import type { CSSProperties, MouseEvent, PointerEvent } from "react";

import type { Box, SourceMetadata } from "../../domain/workspace";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type BoxEditDrag = {
  elementId: string;
  mode: "move" | "resize";
  handle: ResizeHandle | null;
  startX: number;
  startY: number;
  startBox: Box;
};

export type DrawingEvent = PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>;
export type DrawingEventPhase = "down" | "move" | "up";
export type ViewportRect = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;

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
const FOCUS_EDGE_GUTTER = 24;
const FOCUS_COMFORT_INSET_X = 0.28;
const FOCUS_COMFORT_INSET_Y = 0.24;

export const FOCUS_PAN_THRESHOLD = 16;
export const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function pointsToBox(startX: number, startY: number, endX: number, endY: number): Box {
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

export function eventPointToImage(event: DrawingEvent, source: SourceMetadata): { x: number; y: number } {
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

export function normalizeWheelDelta(event: globalThis.WheelEvent): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * 240;
  }
  return event.deltaY;
}

export function readGestureScale(event: Event): number {
  const scale = (event as GestureScaleEvent).scale;
  return typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
}

export function eventPointToImageWithin(
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

export function calculateFocusPanDelta({
  artboardRect,
  stageRect,
  elementScreenX,
  elementScreenY,
}: {
  artboardRect: ViewportRect;
  stageRect: ViewportRect;
  elementScreenX: number;
  elementScreenY: number;
}): { deltaX: number; deltaY: number } {
  return {
    deltaX: calculateFocusAxisDelta({
      artStart: artboardRect.left,
      artEnd: artboardRect.right,
      artSize: artboardRect.width,
      stageStart: stageRect.left,
      stageEnd: stageRect.right,
      stageSize: stageRect.width,
      elementScreenPosition: elementScreenX,
      comfortInset: FOCUS_COMFORT_INSET_X,
      fitMode: "center",
    }),
    deltaY: calculateFocusAxisDelta({
      artStart: artboardRect.top,
      artEnd: artboardRect.bottom,
      artSize: artboardRect.height,
      stageStart: stageRect.top,
      stageEnd: stageRect.bottom,
      stageSize: stageRect.height,
      elementScreenPosition: elementScreenY,
      comfortInset: FOCUS_COMFORT_INSET_Y,
      fitMode: "start",
    }),
  };
}

function calculateFocusAxisDelta({
  artStart,
  artEnd,
  artSize,
  stageStart,
  stageEnd,
  stageSize,
  elementScreenPosition,
  comfortInset,
  fitMode,
}: {
  artStart: number;
  artEnd: number;
  artSize: number;
  stageStart: number;
  stageEnd: number;
  stageSize: number;
  elementScreenPosition: number;
  comfortInset: number;
  fitMode: "center" | "start";
}): number {
  const gutter = Math.min(FOCUS_EDGE_GUTTER, Math.max(8, stageSize * 0.08));
  if (artSize <= stageSize - gutter * 2) {
    const targetArtStart = fitMode === "center"
      ? stageStart + (stageSize - artSize) / 2
      : stageStart + gutter;
    return targetArtStart - artStart;
  }

  const comfortStart = stageStart + stageSize * comfortInset;
  const comfortEnd = stageEnd - stageSize * comfortInset;
  const rawDelta =
    elementScreenPosition < comfortStart
      ? comfortStart - elementScreenPosition
      : elementScreenPosition > comfortEnd
        ? comfortEnd - elementScreenPosition
        : 0;
  const minDelta = stageEnd - gutter - artEnd;
  const maxDelta = stageStart + gutter - artStart;
  return clamp(rawDelta, minDelta, maxDelta);
}

export function boxToPercentStyle(box: Box, source: SourceMetadata): CSSProperties {
  return {
    left: `${(box.x / source.width) * 100}%`,
    top: `${(box.y / source.height) * 100}%`,
    width: `${(box.w / source.width) * 100}%`,
    height: `${(box.h / source.height) * 100}%`,
  };
}

export function draftEditorStyle(box: Box, source: SourceMetadata): CSSProperties {
  return {
    left: `${(box.x / source.width) * 100}%`,
    top: `${(box.y / source.height) * 100}%`,
  };
}

export function keyboardDelta(key: string, step: number): { x: number; y: number } | null {
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

export function parseResizeHandle(value: string | undefined): ResizeHandle | null {
  return RESIZE_HANDLES.includes(value as ResizeHandle) ? value as ResizeHandle : null;
}

export function moveBox(box: Box, deltaX: number, deltaY: number, source: SourceMetadata): Box {
  const width = clamp(Math.round(box.w), 1, source.width);
  const height = clamp(Math.round(box.h), 1, source.height);
  return {
    x: clamp(Math.round(box.x + deltaX), 0, source.width - width),
    y: clamp(Math.round(box.y + deltaY), 0, source.height - height),
    w: width,
    h: height,
  };
}

export function resizeBox(
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

export function pointIsInsideBox(point: { x: number; y: number }, box: Box): boolean {
  return (
    point.x >= box.x
    && point.y >= box.y
    && point.x <= box.x + box.w
    && point.y <= box.y + box.h
  );
}

export function boxArea(box: Box): number {
  return Math.max(1, box.w) * Math.max(1, box.h);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
