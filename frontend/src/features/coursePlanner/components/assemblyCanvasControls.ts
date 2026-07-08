import type { AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import {
  removePlacement,
  updatePlacementTransform,
} from "../assembly/assemblyManifestDraft";
import type { ChapterSceneAssemblyTransform } from "../types";

export const ASSEMBLY_ASSET_DRAG_MIME = "application/x-art-pipeline-assembly-asset-id";

type CanvasPoint = { x: number; y: number };
type CanvasSize = { width: number; height: number };
type CanvasBox = { x: number; y: number; w: number; h: number };

export function writeAssemblyAssetDragData(dataTransfer: DataTransfer, assetId: string) {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(ASSEMBLY_ASSET_DRAG_MIME, assetId);
  dataTransfer.setData("text/plain", assetId);
}

export function readAssemblyAssetDragData(dataTransfer: DataTransfer | null): string | null {
  if (!dataTransfer) {
    return null;
  }
  return dataTransfer.getData(ASSEMBLY_ASSET_DRAG_MIME) || dataTransfer.getData("text/plain") || null;
}

export function nudgeAssemblyPlacements(
  draft: AssemblyManifestDraft,
  placementIds: string[],
  sceneSize: CanvasSize,
  delta: CanvasPoint,
) {
  return updateSelectedPlacementTransforms(draft, placementIds, sceneSize, (transform) => ({
    ...transform,
    cx: transform.cx + delta.x / sceneSize.width,
    cy: transform.cy + delta.y / sceneSize.height,
  }));
}

export function removeAssemblyPlacements(draft: AssemblyManifestDraft, placementIds: string[]) {
  return placementIds.reduce((nextDraft, placementId) => removePlacement(nextDraft, placementId), draft);
}

export function canvasPointFromEvent(
  event: Pick<MouseEvent | PointerEvent | DragEvent, "clientX" | "clientY">,
  artboard: HTMLElement,
  sceneSize: CanvasSize,
): CanvasPoint {
  const rect = artboard.getBoundingClientRect();
  if (
    !Number.isFinite(event.clientX)
    || !Number.isFinite(event.clientY)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return { x: Number.NaN, y: Number.NaN };
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * sceneSize.width,
    y: ((event.clientY - rect.top) / rect.height) * sceneSize.height,
  };
}

export function isFiniteCanvasPoint(point: CanvasPoint | null): point is CanvasPoint {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function boxIntersectsSelection(left: CanvasBox, right: CanvasBox) {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function updateSelectedPlacementTransforms(
  draft: AssemblyManifestDraft,
  placementIds: string[],
  sceneSize: CanvasSize,
  update: (transform: ChapterSceneAssemblyTransform) => ChapterSceneAssemblyTransform,
) {
  const selectedIds = new Set(placementIds);
  return draft.placements.reduce((nextDraft, placement) => (
    selectedIds.has(placement.id)
      ? updatePlacementTransform(nextDraft, placement.id, clampTransform(update(placement.transform), sceneSize))
      : nextDraft
  ), draft);
}

function clampTransform(transform: ChapterSceneAssemblyTransform, sceneSize: CanvasSize): ChapterSceneAssemblyTransform {
  // WHY: keyboard nudges can push normalized coordinates outside the backend protocol, so this keeps
  // movement edits inside the manifest bounds while preserving the authored scene-pixel minimum size.
  return clampTransformPosition({
    ...transform,
    w: Math.max(transform.w, 1 / sceneSize.width),
    h: Math.max(transform.h, 1 / sceneSize.height),
  });
}

function clampTransformPosition(transform: ChapterSceneAssemblyTransform): ChapterSceneAssemblyTransform {
  return {
    ...transform,
    cx: clamp(transform.cx, transform.w / 2, 1 - transform.w / 2),
    cy: clamp(transform.cy, transform.h / 2, 1 - transform.h / 2),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
