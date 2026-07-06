import type { AssemblyManifestDraft } from "./assemblyManifestDraft";
import type { ChapterSceneAssemblyPlacement, ChapterScenePackage } from "../types";

export function sameEmptySceneSize(
  left: ChapterScenePackage["assembly"]["empty_scene_size"],
  right: ChapterScenePackage["assembly"]["empty_scene_size"],
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }
  return left.width === right.width && left.height === right.height;
}

export function manifestKeyOf(manifest: ChapterScenePackage["assembly"]) {
  const { updated_at: _updatedAt, ...materialManifest } = manifest;
  // WHY: updated_at 是服务端持久化元数据，不是作者在 Assembly editor 里编辑的内容。
  // 把它纳入 dirty/conflict key 会把后台刷新或保存回包误判成远端内容冲突。
  return JSON.stringify(materialManifest);
}

export function reconcileAlignmentRiskPlacementIds(
  currentDraft: AssemblyManifestDraft,
  nextDraft: AssemblyManifestDraft,
  alignmentRiskPlacementIds: string[],
) {
  if (alignmentRiskPlacementIds.length === 0) {
    return alignmentRiskPlacementIds;
  }
  const currentPlacementsById = new Map(currentDraft.placements.map((placement) => [placement.id, placement]));
  const nextPlacementsById = new Map(nextDraft.placements.map((placement) => [placement.id, placement]));
  return alignmentRiskPlacementIds.filter((placementId) => {
    const nextPlacement = nextPlacementsById.get(placementId);
    if (!nextPlacement) {
      return false;
    }
    const currentPlacement = currentPlacementsById.get(placementId);
    if (!currentPlacement) {
      return true;
    }
    return !hasMaterialTransformChange(currentPlacement, nextPlacement);
  });
}

function hasMaterialTransformChange(
  currentPlacement: ChapterSceneAssemblyPlacement,
  nextPlacement: ChapterSceneAssemblyPlacement,
) {
  return (
    currentPlacement.transform.cx !== nextPlacement.transform.cx
    || currentPlacement.transform.cy !== nextPlacement.transform.cy
    || currentPlacement.transform.w !== nextPlacement.transform.w
    || currentPlacement.transform.h !== nextPlacement.transform.h
    || currentPlacement.transform.rotation_deg !== nextPlacement.transform.rotation_deg
  );
}
