import { loadScenePackageImage } from "../scenePackageMedia";
import type { ChapterSceneAssemblyPlacement, ChapterScenePackage } from "../types";

const DEFAULT_ASSEMBLY_EXPORT_SIZE = { width: 1024, height: 1024 } as const;

export async function exportAssemblyPreviewFile(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"] = scenePackage.assembly,
): Promise<File> {
  const emptySceneImageId = scenePackage.current_empty_scene_image_id;
  if (!emptySceneImageId) {
    throw new Error("Could not export assembly preview without a selected Empty Scene Image.");
  }

  const selectedEmptyScene = currentEmptySceneImage(scenePackage);
  const canvasSize = selectedEmptyScene
    ? { width: selectedEmptyScene.width, height: selectedEmptyScene.height }
    : manifest.empty_scene_size ?? DEFAULT_ASSEMBLY_EXPORT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare assembly export.");
  }

  // WHY: Lock Final 产物要复用当前 assembly 的真实素材合同；
  // 不能再导出占位图，否则 backend 保存的 final scene 与用户看到的摆放结果会分叉。
  const emptySceneImage = await loadScenePackageImage(scenePackage.chapter_id, "empty_scene_images", emptySceneImageId);
  context.drawImage(emptySceneImage, 0, 0, canvas.width, canvas.height);

  for (const placement of paintOrderedPlacements(manifest.placements, manifest.layer_order)) {
    const asset = scenePackage.chapter_assets.find((chapterAsset) => chapterAsset.id === placement.asset_id);
    if (!asset) {
      throw new Error(`Could not find Chapter Asset ${placement.asset_id} for assembly export.`);
    }
    const assetImage = await loadScenePackageImage(scenePackage.chapter_id, "chapter_assets", asset.id);
    drawPlacementImage(context, assetImage, placement, canvas.width, canvas.height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob);
        return;
      }
      reject(new Error("Could not export assembly preview."));
    }, "image/png");
  });

  return new File([blob], "chapter-scene-final.png", { type: "image/png" });
}

function currentEmptySceneImage(scenePackage: ChapterScenePackage) {
  return scenePackage.empty_scene_images.find((image) => image.id === scenePackage.current_empty_scene_image_id) ?? null;
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

function paintOrderedPlacements(
  placements: ChapterSceneAssemblyPlacement[],
  layerOrder: string[],
): ChapterSceneAssemblyPlacement[] {
  // WHY: layer_order[0] 是 frontmost；SVG/canvas 后绘制的元素在上方，
  // 因此输出给渲染层时必须反向成 back-to-front。
  return [...orderedPlacements(placements, layerOrder)].reverse();
}

function drawPlacementImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  placement: ChapterSceneAssemblyPlacement,
  canvasWidth: number,
  canvasHeight: number,
) {
  const width = placement.transform.w * canvasWidth;
  const height = placement.transform.h * canvasHeight;
  const centerX = placement.transform.cx * canvasWidth;
  const centerY = placement.transform.cy * canvasHeight;

  context.save();
  context.translate(centerX, centerY);
  context.rotate((placement.transform.rotation_deg * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}
