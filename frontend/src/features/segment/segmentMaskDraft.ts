import type { Box } from "../../domain/workspace";

export type CanvasPoint = { x: number; y: number };
export type MaskDraftOperation = "add" | "subtract";
export type MaskViewTransform = { scale: number; offsetX: number; offsetY: number };

const FALLBACK_MASK_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const QUICK_MASK_PINK = { r: 255, g: 77, b: 166, a: 96 };
const QUICK_MASK_SELECTION_PINK = { r: 255, g: 77, b: 166, a: 178 };

export function readCanvasPointFromFrame(
  frame: HTMLDivElement,
  clientX: number,
  clientY: number,
  canvas: Box,
  viewTransform: MaskViewTransform = { scale: 1, offsetX: 0, offsetY: 0 },
): CanvasPoint | null {
  const rect = frame.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || canvas.w <= 0 || canvas.h <= 0) {
    return null;
  }

  const rendered = transformedContainRect(rect.width, rect.height, canvas, viewTransform);
  // WHY: mask patch 接口使用元素裁剪图自己的 canvas 坐标；这里把 object-fit: contain 后的屏幕坐标反投影，
  // 保证用户在左侧源图点到哪里，实际修改的就是同一个 mask 像素位置。
  const x = ((clientX - rect.left - rendered.left) / rendered.width) * canvas.w;
  const y = ((clientY - rect.top - rendered.top) / rendered.height) * canvas.h;
  return {
    x: Math.round(clampNumber(x, 0, Math.max(0, canvas.w - 1))),
    y: Math.round(clampNumber(y, 0, Math.max(0, canvas.h - 1))),
  };
}

export function canvasPointToFrameStyle(
  point: CanvasPoint,
  size: number,
  canvas: Box,
  frameSize: { width: number; height: number },
  viewTransform: MaskViewTransform = { scale: 1, offsetX: 0, offsetY: 0 },
): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const rendered = transformedContainRect(frameSize.width, frameSize.height, canvas, viewTransform);
  const scaleX = rendered.width / Math.max(1, canvas.w);
  const scaleY = rendered.height / Math.max(1, canvas.h);
  const diameter = Math.max(6, size * Math.min(scaleX, scaleY));
  return {
    left: `${rendered.left + point.x * scaleX}px`,
    top: `${rendered.top + point.y * scaleY}px`,
    width: `${diameter}px`,
    height: `${diameter}px`,
  };
}

export function canvasViewToFrameStyle(
  canvas: Box,
  frameSize: { width: number; height: number },
  viewTransform: MaskViewTransform,
): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const rendered = transformedContainRect(frameSize.width, frameSize.height, canvas, viewTransform);
  return {
    left: `${rendered.left}px`,
    top: `${rendered.top}px`,
    width: `${rendered.width}px`,
    height: `${rendered.height}px`,
  };
}

export function drawBrushIntoDraft(
  canvas: HTMLCanvasElement,
  point: CanvasPoint,
  size: number,
  operation: MaskDraftOperation,
) {
  const context = getCanvas2dContext(canvas);
  if (!context) {
    return;
  }
  context.save();
  context.fillStyle = operation === "add" ? "#ffffff" : "#000000";
  context.beginPath();
  context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
  context.fill();
  context.restore();
  thresholdMaskCanvas(canvas);
}

export function buildBrushSelection(
  point: CanvasPoint,
  size: number,
  width = Math.max(1, Math.ceil(point.x + size)),
  height = Math.max(1, Math.ceil(point.y + size)),
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = getCanvas2dContext(canvas);
  if (context) {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

export function mergeSelectionIntoDraft(
  draftCanvas: HTMLCanvasElement,
  selectionCanvas: HTMLCanvasElement,
  operation: MaskDraftOperation,
) {
  const draftContext = getCanvas2dContext(draftCanvas);
  const selectionContext = getCanvas2dContext(selectionCanvas);
  if (!draftContext || !selectionContext) {
    return;
  }

  const width = draftCanvas.width;
  const height = draftCanvas.height;
  const draft = draftContext.getImageData(0, 0, width, height);
  const selection = selectionContext.getImageData(0, 0, width, height);
  for (let index = 0; index < draft.data.length; index += 4) {
    const selected = selection.data[index + 3] > 0 || selection.data[index] > 0;
    if (!selected) {
      continue;
    }
    const value = operation === "add" ? 255 : 0;
    draft.data[index] = value;
    draft.data[index + 1] = value;
    draft.data[index + 2] = value;
    draft.data[index + 3] = 255;
  }
  draftContext.putImageData(draft, 0, 0);
}

export function buildSelectionOverlayDataUrl(
  selectionCanvas: HTMLCanvasElement,
  operation: MaskDraftOperation,
): string {
  void operation;
  const canvas = document.createElement("canvas");
  canvas.width = selectionCanvas.width;
  canvas.height = selectionCanvas.height;
  const selectionContext = getCanvas2dContext(selectionCanvas);
  const context = getCanvas2dContext(canvas);
  if (!selectionContext || !context) {
    return canvasToDataUrl(selectionCanvas);
  }

  const selection = selectionContext.getImageData(0, 0, selectionCanvas.width, selectionCanvas.height);
  const overlay = context.createImageData(canvas.width, canvas.height);
  const width = selectionCanvas.width;
  const height = selectionCanvas.height;
  for (let index = 0; index < selection.data.length; index += 4) {
    const selected = selection.data[index + 3] > 0 || selection.data[index] > 0;
    if (!selected || !isSelectionEdge(selection.data, index / 4, width, height)) {
      continue;
    }
    overlay.data[index] = QUICK_MASK_SELECTION_PINK.r;
    overlay.data[index + 1] = QUICK_MASK_SELECTION_PINK.g;
    overlay.data[index + 2] = QUICK_MASK_SELECTION_PINK.b;
    overlay.data[index + 3] = QUICK_MASK_SELECTION_PINK.a;
  }
  context.putImageData(overlay, 0, 0);
  return canvasToDataUrl(canvas);
}

export function buildBackgroundMaskOverlayDataUrl(
  maskSource: HTMLCanvasElement | HTMLImageElement,
  fallbackSize?: { w: number; h: number },
): string {
  const sourceCanvas = document.createElement("canvas");
  const width = maskSource instanceof HTMLCanvasElement
    ? maskSource.width
    : maskSource.naturalWidth || fallbackSize?.w || maskSource.width;
  const height = maskSource instanceof HTMLCanvasElement
    ? maskSource.height
    : maskSource.naturalHeight || fallbackSize?.h || maskSource.height;
  sourceCanvas.width = Math.max(1, width);
  sourceCanvas.height = Math.max(1, height);

  const sourceContext = getCanvas2dContext(sourceCanvas);
  if (!sourceContext) {
    return maskSource instanceof HTMLCanvasElement ? canvasToDataUrl(maskSource) : canvasToDataUrl(sourceCanvas);
  }

  sourceContext.drawImage(maskSource, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const mask = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const overlay = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height);
  for (let index = 0; index < mask.data.length; index += 4) {
    const luma = (mask.data[index] + mask.data[index + 1] + mask.data[index + 2]) / 3;
    const isForeground = mask.data[index + 3] > 0 && luma > 16;
    if (isForeground) {
      continue;
    }
    overlay.data[index] = QUICK_MASK_PINK.r;
    overlay.data[index + 1] = QUICK_MASK_PINK.g;
    overlay.data[index + 2] = QUICK_MASK_PINK.b;
    overlay.data[index + 3] = QUICK_MASK_PINK.a;
  }
  sourceContext.putImageData(overlay, 0, 0);
  return canvasToDataUrl(sourceCanvas);
}

export function thresholdMaskCanvas(canvas: HTMLCanvasElement) {
  const context = getCanvas2dContext(canvas);
  if (!context) {
    return;
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luma = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
    const value = imageData.data[index + 3] > 0 && luma > 16 ? 255 : 0;
    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
    imageData.data[index + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
}

export function floodFillSelection(
  source: ImageData,
  selection: ImageData,
  seed: CanvasPoint,
  tolerance: number,
) {
  const width = source.width;
  const height = source.height;
  const startX = clampNumber(Math.round(seed.x), 0, width - 1);
  const startY = clampNumber(Math.round(seed.y), 0, height - 1);
  const startIndex = (startY * width + startX) * 4;
  const seedColor = [
    source.data[startIndex],
    source.data[startIndex + 1],
    source.data[startIndex + 2],
    source.data[startIndex + 3],
  ];
  const visited = new Uint8Array(width * height);
  const stack = [startY * width + startX];

  while (stack.length) {
    const pointIndex = stack.pop();
    if (pointIndex === undefined || visited[pointIndex]) {
      continue;
    }
    visited[pointIndex] = 1;
    const pixelIndex = pointIndex * 4;
    if (!isSimilarColor(source.data, pixelIndex, seedColor, tolerance)) {
      continue;
    }

    selection.data[pixelIndex] = 255;
    selection.data[pixelIndex + 1] = 255;
    selection.data[pixelIndex + 2] = 255;
    selection.data[pixelIndex + 3] = 255;
    const x = pointIndex % width;
    const y = Math.floor(pointIndex / width);
    if (x > 0) stack.push(pointIndex - 1);
    if (x + 1 < width) stack.push(pointIndex + 1);
    if (y > 0) stack.push(pointIndex - width);
    if (y + 1 < height) stack.push(pointIndex + width);
  }
}

export function removeSmallDraftFragments(imageData: ImageData, minArea: number) {
  const width = imageData.width;
  const height = imageData.height;
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || imageData.data[start * 4] === 0) {
      continue;
    }

    const component = collectMaskComponent(imageData, start, visited);
    if (component.length >= minArea) {
      continue;
    }
    for (const pointIndex of component) {
      const index = pointIndex * 4;
      imageData.data[index] = 0;
      imageData.data[index + 1] = 0;
      imageData.data[index + 2] = 0;
      imageData.data[index + 3] = 255;
    }
  }
}

export function buildStickerPreviewDataUrl(
  sourceImage: HTMLImageElement | null,
  maskCanvas: HTMLCanvasElement,
): string {
  if (!sourceImage?.complete || sourceImage.naturalWidth <= 0) {
    return canvasToDataUrl(maskCanvas);
  }
  const canvas = document.createElement("canvas");
  canvas.width = maskCanvas.width;
  canvas.height = maskCanvas.height;
  const context = getCanvas2dContext(canvas);
  const maskContext = getCanvas2dContext(maskCanvas);
  if (!context || !maskContext) {
    return canvasToDataUrl(maskCanvas);
  }
  context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  for (let index = 0; index < source.data.length; index += 4) {
    source.data[index + 3] = mask.data[index] > 0 ? 255 : 0;
  }
  context.putImageData(source, 0, 0);
  return canvasToDataUrl(canvas);
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  const restoreConsole = silenceCanvasNotImplementedErrors();
  try {
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.startsWith("data:image/png;base64,") ? dataUrl : FALLBACK_MASK_DATA_URL;
  } catch {
    return FALLBACK_MASK_DATA_URL;
  } finally {
    restoreConsole();
  }
}

export function getCanvas2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const restoreConsole = silenceCanvasNotImplementedErrors();
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  } finally {
    restoreConsole();
  }
}

function containRect(frameWidth: number, frameHeight: number, canvas: Box) {
  const canvasAspect = canvas.w / canvas.h;
  const frameAspect = frameWidth / frameHeight;
  return frameAspect > canvasAspect
    ? {
      width: frameHeight * canvasAspect,
      height: frameHeight,
      left: (frameWidth - frameHeight * canvasAspect) / 2,
      top: 0,
    }
    : {
      width: frameWidth,
      height: frameWidth / canvasAspect,
      left: 0,
      top: (frameHeight - frameWidth / canvasAspect) / 2,
    };
}

function transformedContainRect(
  frameWidth: number,
  frameHeight: number,
  canvas: Box,
  viewTransform: MaskViewTransform,
) {
  const rendered = containRect(frameWidth, frameHeight, canvas);
  const scale = Math.max(0.1, viewTransform.scale || 1);
  const width = rendered.width * scale;
  const height = rendered.height * scale;
  return {
    width,
    height,
    left: rendered.left + (rendered.width - width) / 2 + viewTransform.offsetX,
    top: rendered.top + (rendered.height - height) / 2 + viewTransform.offsetY,
  };
}

function isSelectionEdge(data: Uint8ClampedArray, pointIndex: number, width: number, height: number): boolean {
  const x = pointIndex % width;
  const y = Math.floor(pointIndex / width);
  for (const neighbor of neighborIndexes(x, y, width, height)) {
    const index = neighbor * 4;
    if (data[index + 3] <= 0 && data[index] <= 0) {
      return true;
    }
  }
  return x === 0 || y === 0 || x + 1 === width || y + 1 === height;
}

function isSimilarColor(
  data: Uint8ClampedArray,
  index: number,
  seedColor: number[],
  tolerance: number,
): boolean {
  return (
    Math.abs(data[index] - seedColor[0]) <= tolerance
    && Math.abs(data[index + 1] - seedColor[1]) <= tolerance
    && Math.abs(data[index + 2] - seedColor[2]) <= tolerance
    && Math.abs(data[index + 3] - seedColor[3]) <= Math.max(16, tolerance)
  );
}

function collectMaskComponent(imageData: ImageData, start: number, visited: Uint8Array): number[] {
  const width = imageData.width;
  const height = imageData.height;
  const component: number[] = [];
  const stack = [start];
  visited[start] = 1;
  while (stack.length) {
    const pointIndex = stack.pop();
    if (pointIndex === undefined) {
      continue;
    }
    component.push(pointIndex);
    const x = pointIndex % width;
    const y = Math.floor(pointIndex / width);
    for (const neighbor of neighborIndexes(x, y, width, height)) {
      if (visited[neighbor] || imageData.data[neighbor * 4] === 0) {
        continue;
      }
      visited[neighbor] = 1;
      stack.push(neighbor);
    }
  }
  return component;
}

function neighborIndexes(x: number, y: number, width: number, height: number): number[] {
  const indexes: number[] = [];
  if (x > 0) indexes.push(y * width + x - 1);
  if (x + 1 < width) indexes.push(y * width + x + 1);
  if (y > 0) indexes.push((y - 1) * width + x);
  if (y + 1 < height) indexes.push((y + 1) * width + x);
  return indexes;
}

function silenceCanvasNotImplementedErrors(): () => void {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("Not implemented: HTMLCanvasElement")) {
      return;
    }
    originalError(...args);
  };
  return () => {
    console.error = originalError;
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
