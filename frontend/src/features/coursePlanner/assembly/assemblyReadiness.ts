import type {
  ChapterSceneAssemblyPlacement,
  ChapterScenePackage,
  TargetObjectItem,
} from "../types";

export type AssemblyTargetCoverageItem = {
  target: TargetObjectItem;
  status: "covered" | "missing";
  covered_asset_names: string[];
  exemption_reason: string | null;
};

export type AssemblyReadiness = {
  is_ready: boolean;
  reasons: string[];
  target_coverage: AssemblyTargetCoverageItem[];
};

export function buildAssemblyReadiness(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"] = scenePackage.assembly,
): AssemblyReadiness {
  const reasons: string[] = [];
  if (!hasAvailableEmptyScene(scenePackage, manifest)) {
    reasons.push("Select an Empty Scene Image.");
  }
  if (!hasMatchingCurrentEmptySceneForPlacements(scenePackage, manifest)) {
    // WHY: backend Lock Final freezes placements against current_empty_scene_image_id；
    // frontend ready 状态必须暴露同一个领域不变量，不能只验证图片“存在”。
    reasons.push(
      "Saved Assembly still points to a different Empty Scene Image. Re-save after reviewing the current selection.",
    );
  }
  if (!hasValidPlacementTransforms(manifest.placements)) {
    reasons.push("Fix invalid placement transforms.");
  }
  if (!hasCompleteLayerOrder(manifest.placements, manifest.layer_order)) {
    reasons.push("Fix layer order coverage.");
  }
  if (!allPlacementAssetsAvailable(scenePackage, manifest)) {
    reasons.push("Replace placements that reference unavailable Chapter Assets.");
  }
  if (!allDependencyRefsValid(manifest)) {
    reasons.push("Fix placement dependency references.");
  }

  const targetCoverage = buildTargetCoverage(scenePackage, manifest);
  const missingTargets = targetCoverage.filter((item) => (
    item.status === "missing" && isRequiredTarget(item.target)
  ));
  if (missingTargets.length > 0) {
    reasons.push(
      "Missing target objects: "
        + missingTargets.map((item) => item.target.label).join(", ")
        + ".",
    );
  }

  return {
    is_ready: reasons.length === 0,
    reasons,
    target_coverage: targetCoverage,
  };
}

export function isAssemblyReady(scenePackage: ChapterScenePackage): boolean {
  return buildAssemblyReadiness(scenePackage).is_ready;
}

function buildTargetCoverage(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"],
): AssemblyTargetCoverageItem[] {
  const availableAssets = new Map(
    scenePackage.chapter_assets
      .filter((asset) => asset.status === "available")
      .map((asset) => [asset.id, asset] as const),
  );
  const coveredAssetNamesByTargetId = new Map<string, string[]>();
  for (const placement of manifest.placements) {
    const asset = availableAssets.get(placement.asset_id);
    if (!asset?.linked_target_object_id) {
      continue;
    }
    coveredAssetNamesByTargetId.set(asset.linked_target_object_id, [
      ...(coveredAssetNamesByTargetId.get(asset.linked_target_object_id) ?? []),
      asset.display_name,
    ]);
  }
  const notesByTargetId = new Map(
    scenePackage.target_object_exemptions.map((exemption) => [
      exemption.target_object_id,
      exemption.reason,
    ] as const),
  );

  return scenePackage.target_objects.map((target) => {
    const coveredAssetNames = coveredAssetNamesByTargetId.get(target.id) ?? [];
    if (coveredAssetNames.length > 0) {
      return {
        target,
        status: "covered",
        covered_asset_names: coveredAssetNames,
        exemption_reason: null,
      };
    }
    // WHY: 历史 exemption 只能作为备注显示，不能再改变 ready 判定；
    // Chapter 最终产物必须由真实 placed asset 覆盖 target object。
    return {
      target,
      status: "missing",
      covered_asset_names: [],
      exemption_reason: notesByTargetId.get(target.id) ?? null,
    };
  });
}

function allPlacementAssetsAvailable(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"],
): boolean {
  const availableAssetIds = new Set(
    scenePackage.chapter_assets
      .filter((asset) => asset.status === "available")
      .map((asset) => asset.id),
  );
  return manifest.placements.every((placement) =>
    availableAssetIds.has(placement.asset_id)
  );
}

function allDependencyRefsValid(
  manifest: ChapterScenePackage["assembly"],
): boolean {
  const placementIds = new Set(manifest.placements.map((placement) => placement.id));
  return manifest.placements.every((placement) => (
    placement.requires_placed.every((requiredId) => placementIds.has(requiredId))
  ));
}

function hasAvailableEmptyScene(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"],
): boolean {
  if (!manifest.empty_scene_image_id) {
    return false;
  }
  // WHY: Ready/Lock Final 只能看 manifest 中持久化的 Empty Scene 引用是否解析到可用领域事实；
  // selection、drawer、zoom 等 UI 状态不能成为第二套 gate。
  return scenePackage.empty_scene_images.some((image) => (
    image.id === manifest.empty_scene_image_id && image.status === "available"
  ));
}

function hasMatchingCurrentEmptySceneForPlacements(
  scenePackage: ChapterScenePackage,
  manifest: ChapterScenePackage["assembly"],
): boolean {
  if (manifest.placements.length === 0) {
    return true;
  }
  return (
    Boolean(scenePackage.current_empty_scene_image_id)
    && manifest.empty_scene_image_id === scenePackage.current_empty_scene_image_id
  );
}

function isRequiredTarget(target: TargetObjectItem): boolean {
  return target.priority === "core" || target.priority === "required";
}

function hasValidPlacementTransforms(
  placements: ChapterSceneAssemblyPlacement[],
): boolean {
  return placements.every((placement) => {
    const { cx, cy, w, h } = placement.transform;
    return (
      cx >= 0
      && cx <= 1
      && cy >= 0
      && cy <= 1
      && w > 0
      && w <= 1
      && h > 0
      && h <= 1
    );
  });
}

function hasCompleteLayerOrder(
  placements: ChapterSceneAssemblyPlacement[],
  layerOrder: string[],
): boolean {
  const placementIds = placements.map((placement) => placement.id);
  return (
    placementIds.length === layerOrder.length
    && placementIds.every((placementId) => layerOrder.includes(placementId))
    && new Set(layerOrder).size === layerOrder.length
  );
}
