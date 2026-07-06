import type { CanvasObjectBox, CanvasObjectView } from "../../canvasObjects";
import { readablePlacementName } from "../components/assemblyDisplayNames";
import { projectLayerOrderForHitTest } from "../../authoring/layerTreeMoveModel";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterSceneAssemblyPlacement, ChapterSceneAssemblyTransform, ChapterScenePackage } from "../types";
import type { AssemblyManifestDraft } from "./assemblyManifestDraft";

type CanvasSize = { width: number; height: number };

type BuildAssemblyCanvasObjectsInput = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
  sceneSize: CanvasSize | null;
};

export function placementToCanvasBox(
  transform: ChapterSceneAssemblyTransform,
  sceneSize: CanvasSize,
): CanvasObjectBox {
  return {
    x: (transform.cx - transform.w / 2) * sceneSize.width,
    y: (transform.cy - transform.h / 2) * sceneSize.height,
    w: transform.w * sceneSize.width,
    h: transform.h * sceneSize.height,
    rotationDeg: transform.rotation_deg,
  };
}

export function canvasBoxToPlacementTransform(
  box: CanvasObjectBox,
  sceneSize: CanvasSize,
): ChapterSceneAssemblyTransform {
  return {
    cx: (box.x + box.w / 2) / sceneSize.width,
    cy: (box.y + box.h / 2) / sceneSize.height,
    w: box.w / sceneSize.width,
    h: box.h / sceneSize.height,
    rotation_deg: box.rotationDeg,
  };
}

export function buildAssemblyCanvasObjects({
  draft,
  scenePackage,
  sceneSize: resolvedSceneSize,
}: BuildAssemblyCanvasObjectsInput): CanvasObjectView[] {
  const sceneSize = selectedCanvasSize(draft, resolvedSceneSize);
  if (!sceneSize) {
    return [];
  }
  const assetById = new Map(scenePackage.chapter_assets.map((asset) => [asset.id, asset]));

  return orderedPlacements(draft.placements, projectLayerOrderForHitTest(draft.layer_order))
    .reverse()
    .flatMap((placement) => {
      const asset = assetById.get(placement.asset_id);
      if (!asset) {
        return [];
      }
      // WHY: Assembly placement 是画布上的真实素材内容；thumbnail 只保留给主画布选中预览，不能承担内容渲染语义。
      const assetImageUrl = scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", asset.id);
      return [{
        id: placement.id,
        displayName: readablePlacementName(placement.display_name, placement.asset_id),
        editableName: readablePlacementName(placement.display_name, placement.asset_id),
        box: placementToCanvasBox(placement.transform, sceneSize),
        contentImageUrl: assetImageUrl,
        thumbnailUrl: assetImageUrl,
        maskUrl: null,
        maskBox: null,
        isVisible: true,
        isLocked: false,
      }];
    });
}

export function createInitialPlacementTransform(input: {
  canvasWidth: number;
  canvasHeight: number;
  assetWidth: number;
  assetHeight: number;
  centerX?: number;
  centerY?: number;
}): ChapterSceneAssemblyTransform {
  const targetLongestSide = Math.min(input.canvasWidth, input.canvasHeight) * 0.25;
  const sourceLongestSide = Math.max(input.assetWidth, input.assetHeight, 1);
  // WHY: Assembly 保存 source 原始尺寸，placement 只保存显示变换；按空场景短边的 25%
  // 建立首帧尺寸，避免 1024x1024 生成图按原像素铺满画布，同时保留素材宽高比。
  const scale = targetLongestSide / sourceLongestSide;

  return {
    cx: round(input.centerX ?? 0.5),
    cy: round(input.centerY ?? 0.5),
    w: round((input.assetWidth * scale) / input.canvasWidth),
    h: round((input.assetHeight * scale) / input.canvasHeight),
    rotation_deg: 0,
  };
}

export function fitCameraBoundsForEmptyScene(emptySceneSize: CanvasSize) {
  return {
    x: 0,
    y: 0,
    w: emptySceneSize.width,
    h: emptySceneSize.height,
  };
}

function orderedPlacements(
  placements: ChapterSceneAssemblyPlacement[],
  layerOrder: string[],
): ChapterSceneAssemblyPlacement[] {
  const placementsById = new Map(placements.map((placement) => [placement.id, placement]));
  const ordered = layerOrder
    .map((placementId) => placementsById.get(placementId))
    .filter((placement): placement is ChapterSceneAssemblyPlacement => Boolean(placement));
  const orderedIds = new Set(ordered.map((placement) => placement.id));
  return [
    ...ordered,
    ...placements.filter((placement) => !orderedIds.has(placement.id)),
  ];
}

function selectedCanvasSize(draft: AssemblyManifestDraft, resolvedSceneSize: CanvasSize | null): CanvasSize | null {
  return resolvedSceneSize ?? draft.empty_scene_size;
}

function round(value: number, precision = 6) {
  const base = 10 ** precision;
  return Math.round(value * base) / base;
}
