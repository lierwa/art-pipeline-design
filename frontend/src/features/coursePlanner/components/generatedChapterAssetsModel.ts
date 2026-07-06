import type { ChapterScenePackage, GeneratedChapterAsset } from "../types";
import { normalizeHumanText } from "./mediaDisplayNames";

export type GeneratedChapterAssetGroupMode = "completeImage" | "run";

export type GeneratedChapterAssetGroup = {
  id: string;
  title: string;
  subtitle: string;
  assets: GeneratedChapterAsset[];
};

type CompleteImage = ChapterScenePackage["complete_images"][number];

export function buildGeneratedChapterAssetGroups(input: {
  assets: GeneratedChapterAsset[];
  groupMode: GeneratedChapterAssetGroupMode;
  query: string;
  scenePackage: ChapterScenePackage;
}): GeneratedChapterAssetGroup[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  const completeImages = new Map(input.scenePackage.complete_images.map((image) => [image.id, image]));
  const filteredAssets = input.assets.filter((asset) => {
    if (!normalizedQuery) {
      return true;
    }
    return generatedAssetSearchText(asset, completeImages.get(asset.complete_scene_image_id)).includes(normalizedQuery);
  });
  const groups = new Map<string, GeneratedChapterAssetGroup>();

  filteredAssets.forEach((asset) => {
    const completeImage = completeImages.get(asset.complete_scene_image_id);
    const groupId = input.groupMode === "completeImage"
      ? `complete:${asset.complete_scene_image_id}`
      : `run:${asset.pipeline_run_id}`;
    const existing = groups.get(groupId);
    if (existing) {
      existing.assets.push(asset);
      existing.subtitle = groupSubtitle(existing.assets);
      return;
    }
    groups.set(groupId, {
      id: groupId,
      title: input.groupMode === "completeImage"
        ? `Complete Image: ${completeImageLabel(completeImage, asset.complete_scene_image_id)}`
        : `Run: ${asset.pipeline_run_id}`,
      subtitle: groupSubtitle([asset]),
      assets: [asset],
    });
  });

  return [...groups.values()];
}

export function generatedChapterAssetKey(asset: GeneratedChapterAsset): string {
  return `${asset.complete_scene_image_id}:${asset.pipeline_run_id}:${asset.run_asset_id}`;
}

export function generatedChapterAssetDimensions(asset: GeneratedChapterAsset): string {
  return asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Dimensions unavailable";
}

export function isGeneratedChapterAssetImportable(asset: GeneratedChapterAsset): boolean {
  // WHY: backend state already encodes the protocol boundary: Codex-generated file present
  // and readable. Quality reports are advisory and must not gate importability.
  return asset.state === "available";
}

export function isGeneratedLineage(asset: ChapterScenePackage["chapter_assets"][number]): boolean {
  return asset.lineage.source_kind === "generated_asset";
}

function generatedAssetSearchText(asset: GeneratedChapterAsset, completeImage?: CompleteImage): string {
  return [
    normalizeHumanText(asset.display_name),
    asset.display_name,
    asset.run_asset_id,
    asset.pipeline_run_id,
    asset.complete_scene_image_id,
    completeImage?.original_filename ?? "",
  ].join(" ").toLowerCase();
}

function completeImageLabel(completeImage: CompleteImage | undefined, fallbackId: string): string {
  return normalizeHumanText(completeImage?.original_filename ?? "") || fallbackId;
}

function groupSubtitle(assets: GeneratedChapterAsset[]): string {
  return `${assets.length} ${assets.length === 1 ? "asset" : "assets"}`;
}
