import type { ChapterScenePackage } from "../types";
import { normalizeHumanText } from "./mediaDisplayNames";

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

export function readableChapterAssetName(asset: Pick<ChapterAsset, "display_name" | "id" | "original_filename">): string {
  const displayName = normalizeHumanText(asset.display_name);
  if (displayName) {
    return displayName;
  }

  const filenameStem = normalizeHumanText(asset.original_filename.replace(/\.[^.]+$/, ""));
  if (filenameStem) {
    return filenameStem;
  }

  return readableAssetId(asset.id);
}

export function readablePlacementName(displayName: string, assetId: string): string {
  return normalizeHumanText(displayName) || readableAssetId(assetId);
}

function readableAssetId(assetId: string): string {
  const suffix = normalizeHumanText(assetId
    .replace(/^chapter_asset_/, "")
    .replace(/^asset_/, "")
    .replace(/[_-]+/g, " ")
    .trim());

  // WHY: 直传素材在导入时可能只有 UUID 文件名；展示层用稳定 asset id 生成短标签，
  // 不回写 manifest，避免把 UI fallback 误当成业务命名事实源。
  return suffix ? `Chapter asset ${suffix}` : "Chapter asset";
}
