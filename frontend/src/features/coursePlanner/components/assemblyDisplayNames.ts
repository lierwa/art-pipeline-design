import type { ChapterScenePackage } from "../types";
import { normalizeHumanText } from "./mediaDisplayNames";

type ChapterAsset = ChapterScenePackage["chapter_assets"][number];

const UNNAMED_ASSET_LABELS = new Set(["Unnamed asset", "Unnamed target asset"]);

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

export function readableAssemblyPlacementName(
  placement: Pick<ChapterScenePackage["assembly"]["placements"][number], "asset_id" | "display_name">,
  assetNameById: ReadonlyMap<string, string>,
): string {
  const rawPlacementName = placement.display_name;
  const trimmedPlacementName = rawPlacementName.trim();
  const generatedPlacementName = readableAssetId(placement.asset_id);
  const normalizedPlacementName = normalizeHumanText(rawPlacementName);
  if (trimmedPlacementName && trimmedPlacementName !== generatedPlacementName && normalizedPlacementName) {
    return rawPlacementName;
  }

  // WHY: 早期自动生成的 placement.display_name 会落成 “Chapter asset 001” 或 UUID；
  // 这不是用户命名，右侧属性/图层/画布必须优先使用资源池同源显示名。
  return assetNameById.get(placement.asset_id) ?? (trimmedPlacementName || generatedPlacementName);
}

export function readableAssetPoolAssetName(asset: ChapterAsset): string {
  const explicitName = normalizeHumanText(asset.display_name);
  if (explicitName) {
    return explicitName;
  }

  const filenameName = normalizeHumanText(asset.original_filename.replace(/\.[^.]+$/, ""));
  if (filenameName) {
    return filenameName;
  }

  // WHY: 直传素材在浏览和画布标签里必须同名；这里仅生成显示名，不回写 manifest。
  return asset.linked_target_object_id ? "Unnamed target asset" : "Unnamed asset";
}

export function buildReadableAssetPoolAssetNames(assets: ChapterAsset[]): Map<string, string> {
  const baseNames = assets.map((asset) => readableAssetPoolAssetName(asset));
  const unnamedTotals = baseNames.reduce((summary, name) => {
    if (UNNAMED_ASSET_LABELS.has(name)) {
      summary.set(name, (summary.get(name) ?? 0) + 1);
    }
    return summary;
  }, new Map<string, number>());
  const unnamedSeen = new Map<string, number>();

  return assets.reduce((names, asset, index) => {
    const baseName = baseNames[index] ?? readableAssetPoolAssetName(asset);
    const duplicateUnnamed = UNNAMED_ASSET_LABELS.has(baseName) && (unnamedTotals.get(baseName) ?? 0) > 1;
    if (!duplicateUnnamed) {
      names.set(asset.id, baseName);
      return names;
    }

    const nextIndex = (unnamedSeen.get(baseName) ?? 0) + 1;
    unnamedSeen.set(baseName, nextIndex);
    names.set(asset.id, `${baseName} ${nextIndex}`);
    return names;
  }, new Map<string, string>());
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
