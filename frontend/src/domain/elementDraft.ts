import {
  Box,
  ElementEditorDraft,
  MissingMaskDraft,
  SourceMetadata,
  WorkspaceElement,
} from "./workspace";
import type { PatchWorkspaceElementRequest } from "./workspaceApi";

export function draftFromElement(element: WorkspaceElement): ElementEditorDraft {
  return {
    name: element.name,
    mode: element.mode,
    layer: String(element.layer),
    bbox: boxToDraft(element.bbox),
    canvas: boxToDraft(element.canvas),
    notes: element.notes,
    visible: element.visible,
  };
}

export function missingMaskDraftFromElement(element: WorkspaceElement): MissingMaskDraft {
  const x = clampInteger(element.bbox.x - element.canvas.x, 0, element.canvas.w);
  const y = clampInteger(element.bbox.y - element.canvas.y, 0, element.canvas.h);
  const maxWidth = Math.max(1, element.canvas.w - x);
  const maxHeight = Math.max(1, element.canvas.h - y);
  return {
    x: String(x),
    y: String(y),
    w: String(clampInteger(element.bbox.w, 1, maxWidth)),
    h: String(clampInteger(element.bbox.h, 1, maxHeight)),
  };
}

export function boxToDraft(box: Box): { x: string; y: string; w: string; h: string } {
  return {
    x: String(box.x),
    y: String(box.y),
    w: String(box.w),
    h: String(box.h),
  };
}

export function parseBox(box: { x: string; y: string; w: string; h: string }): Box | null {
  const x = parseWholeNumber(box.x);
  const y = parseWholeNumber(box.y);
  const w = parseWholeNumber(box.w);
  const h = parseWholeNumber(box.h);

  if (x === null || y === null || w === null || h === null) {
    return null;
  }

  return { x, y, w, h };
}

export function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function boxFitsInsideElementCanvas(box: Box, element: WorkspaceElement): boolean {
  return (
    box.x >= 0
    && box.y >= 0
    && box.w > 0
    && box.h > 0
    && box.x + box.w <= element.canvas.w
    && box.y + box.h <= element.canvas.h
  );
}

export function isGeometryDraftDirty(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const bbox = parseBox(draft.bbox);
  const canvas = parseBox(draft.canvas);
  if (!bbox || !canvas) {
    return true;
  }

  return !boxesEqual(element.bbox, bbox) || !boxesEqual(element.canvas, canvas);
}

export function isElementDraftDirty(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const nextElement = buildElementFromDraft(element, draft);
  if (!nextElement) {
    return true;
  }

  const currentLabel = element.label ?? element.name;
  const nextLabel = nextElement.label ?? nextElement.name;
  return nextElement.name !== element.name
    || nextLabel !== currentLabel
    || nextElement.mode !== element.mode
    || nextElement.layer !== element.layer
    || !boxesEqual(nextElement.bbox, element.bbox)
    || !boxesEqual(nextElement.canvas, element.canvas)
    || nextElement.notes !== element.notes
    || nextElement.visible !== element.visible;
}

export function canPatchElementDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const layer = Number.parseInt(draft.layer, 10);
  const canvas = parseBox(draft.canvas);
  if (Number.isNaN(layer) || !canvas) {
    return false;
  }

  return (
    draft.mode === element.mode
    && layer === element.layer
    && boxesEqual(element.canvas, canvas)
    && draft.notes === element.notes
  );
}

export function hasPatchableContentChanges(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): boolean {
  const bbox = parseBox(draft.bbox);
  if (!bbox) {
    return false;
  }

  const nextLabel = draft.name.trim() || element.name;
  const currentLabel = element.label ?? element.name;
  return !boxesEqual(element.bbox, bbox) || nextLabel !== currentLabel;
}

export function buildElementPatchFromDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): PatchWorkspaceElementRequest | null {
  const bbox = parseBox(draft.bbox);
  if (!bbox) {
    return null;
  }

  const request: PatchWorkspaceElementRequest = {};
  const nextLabel = draft.name.trim() || element.name;
  const currentLabel = element.label ?? element.name;

  if (!boxesEqual(element.bbox, bbox)) {
    request.bbox = bbox;
  }
  if (nextLabel !== currentLabel) {
    request.label = nextLabel;
  }
  if (draft.visible !== element.visible) {
    request.visible = draft.visible;
  }

  return request;
}

export function boxesEqual(left: Box, right: Box): boolean {
  return (
    left.x === right.x
    && left.y === right.y
    && left.w === right.w
    && left.h === right.h
  );
}

export function sourceBoxToElementCanvasBox(sourceBox: Box, element: WorkspaceElement): Box | null {
  const canvas = element.canvas;
  const left = clampInteger(sourceBox.x, canvas.x, canvas.x + canvas.w);
  const top = clampInteger(sourceBox.y, canvas.y, canvas.y + canvas.h);
  const right = clampInteger(sourceBox.x + sourceBox.w, canvas.x, canvas.x + canvas.w);
  const bottom = clampInteger(sourceBox.y + sourceBox.h, canvas.y, canvas.y + canvas.h);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left - canvas.x,
    y: top - canvas.y,
    w: right - left,
    h: bottom - top,
  };
}

export function buildDefaultChildBox(parentBox: Box): Box {
  const width = Math.max(1, Math.floor(parentBox.w / 3));
  const height = Math.max(1, Math.floor(parentBox.h / 3));
  return {
    x: parentBox.x + Math.max(0, Math.floor((parentBox.w - width) / 2)),
    y: parentBox.y + Math.max(0, Math.floor((parentBox.h - height) / 2)),
    w: width,
    h: height,
  };
}

export function clampBoxToSource(box: Box, source: SourceMetadata): Box {
  const sourceWidth = Math.max(1, source.width);
  const sourceHeight = Math.max(1, source.height);
  const width = clampInteger(Math.round(box.w), 1, sourceWidth);
  const height = clampInteger(Math.round(box.h), 1, sourceHeight);

  return {
    x: clampInteger(Math.round(box.x), 0, sourceWidth - width),
    y: clampInteger(Math.round(box.y), 0, sourceHeight - height),
    w: width,
    h: height,
  };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildElementFromDraft(
  element: WorkspaceElement,
  draft: ElementEditorDraft,
): WorkspaceElement | null {
  const layer = Number.parseInt(draft.layer, 10);
  const bbox = parseBox(draft.bbox);
  const canvas = parseBox(draft.canvas);
  if (Number.isNaN(layer) || !bbox || !canvas) {
    return null;
  }

  return {
    ...element,
    name: draft.name.trim() || element.name,
    label: draft.name.trim() || element.name,
    mode: draft.mode,
    layer,
    bbox,
    canvas,
    notes: draft.notes,
    visible: draft.visible,
  };
}
