import type {
  ChapterSceneAssemblyPlacement,
  ChapterScenePackage,
} from "../types";
import type {
  AssemblyDraftPlacement,
  AssemblyDraftValidation,
  AssemblyDraftValidationError,
  AssemblyManifestDraft,
} from "./assemblyManifestDraft";

export function getPlacementDependencyOptionState(
  draft: AssemblyManifestDraft,
  placementId: string,
  dependencyPlacementId: string,
): {
  disabled: boolean;
  reason: "self" | "cycle" | null;
} {
  if (placementId === dependencyPlacementId) {
    return { disabled: true, reason: "self" };
  }

  const placement = draft.placements.find((item) => item.id === placementId) ?? null;
  if (!placement) {
    return { disabled: true, reason: "cycle" };
  }

  if (placement.requires_placed.includes(dependencyPlacementId)) {
    return { disabled: false, reason: null };
  }

  const nextPlacements = draft.placements.map((item) => (
    item.id === placementId
      ? { ...item, requires_placed: uniqueIds([...item.requires_placed, dependencyPlacementId]) }
      : item
  ));
  const placementIds = new Set(nextPlacements.map((item) => item.id));
  return hasDependencyCycle(nextPlacements, placementIds)
    ? { disabled: true, reason: "cycle" }
    : { disabled: false, reason: null };
}

export function arePlacementDependenciesSatisfiedAtStart(
  draft: AssemblyManifestDraft,
  placementId: string,
): boolean {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const placement = placementsById.get(placementId) ?? null;
  if (!placement) {
    return false;
  }
  if (placement.runtime_role === "initial") {
    return true;
  }

  // WHY: Task 7 只需要 scene-start 的最小 runtime 语义：initial placement 在场景加载时已存在，
  // 因此 target 的依赖如果全部指向 initial，就可以立刻满足；更完整的 runtime/readiness 状态机留给后续任务。
  return placement.requires_placed.every((requiredId) => placementsById.get(requiredId)?.runtime_role === "initial");
}

export function validateAssemblyDraft(
  draft: AssemblyManifestDraft,
  scenePackage: ChapterScenePackage,
): AssemblyDraftValidation {
  const errors: AssemblyDraftValidationError[] = [];
  const placementIds = new Set(draft.placements.map((placement) => placement.id));
  const assetIds = new Set(scenePackage.chapter_assets.filter((asset) => asset.status === "available").map((asset) => asset.id));

  for (const placement of draft.placements) {
    if (!assetIds.has(placement.asset_id)) {
      errors.push({
        code: "unknown-placement-asset",
        message: `Placement ${placement.id} references unavailable asset ${placement.asset_id}.`,
        placement_id: placement.id,
      });
    }

    for (const requiredId of placement.requires_placed) {
      if (!placementIds.has(requiredId)) {
        errors.push({
          code: "unknown-placement-dependency",
          message: `Placement ${placement.id} requires unknown placement ${requiredId}.`,
          placement_id: placement.id,
        });
      }
    }
  }

  errors.push(...validateLayerOrderIntegrity(draft.layer_order, draft.placements));
  errors.push(...validateGroupIntegrity(draft));

  if (hasDependencyCycle(draft.placements, placementIds)) {
    errors.push({
      code: "placement-dependency-cycle",
      message: "Placement dependencies must stay acyclic.",
    });
  }

  return {
    is_valid: errors.length === 0,
    errors,
  };
}

function validateGroupIntegrity(draft: AssemblyManifestDraft): AssemblyDraftValidationError[] {
  const errors: AssemblyDraftValidationError[] = [];
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const groupsById = new Map(draft.groups.map((group) => [group.id, group]));

  for (const placement of draft.placements) {
    if (placement.group_id && !groupsById.has(placement.group_id)) {
      errors.push({
        code: "dangling-placement-group",
        message: `Placement ${placement.id} references unknown group ${placement.group_id}.`,
        placement_id: placement.id,
      });
    }
  }

  for (const group of draft.groups) {
    const uniquePlacementIds = uniqueIds(group.placement_ids);

    if (uniquePlacementIds.length < 2) {
      errors.push({
        code: "degenerate-placement-group",
        message: `Group ${group.id} must contain at least two placements.`,
      });
    }

    for (const placementId of uniquePlacementIds) {
      const placement = placementsById.get(placementId);
      if (!placement) {
        errors.push({
          code: "group-unknown-placement",
          message: `Group ${group.id} references unknown placement ${placementId}.`,
        });
        continue;
      }

      if (placement.group_id !== group.id) {
        errors.push({
          code: "group-placement-membership-mismatch",
          message: `Group ${group.id} and placement ${placementId} disagree on membership.`,
          placement_id: placementId,
        });
      }
    }

    for (const placement of draft.placements) {
      if (placement.group_id === group.id && !uniquePlacementIds.includes(placement.id)) {
        errors.push({
          code: "group-placement-membership-mismatch",
          message: `Placement ${placement.id} points at group ${group.id} but is absent from the group membership list.`,
          placement_id: placement.id,
        });
      }
    }
  }

  return errors;
}

function validateLayerOrderIntegrity(
  layerOrder: string[],
  placements: Array<Pick<ChapterSceneAssemblyPlacement, "id">>,
): AssemblyDraftValidationError[] {
  const errors: AssemblyDraftValidationError[] = [];
  const placementIds = new Set(placements.map((placement) => placement.id));
  const seen = new Set<string>();

  for (const placementId of layerOrder) {
    if (!placementIds.has(placementId)) {
      errors.push({
        code: "unknown-layer-order-placement",
        message: `Layer order references unknown placement ${placementId}.`,
        placement_id: placementId,
      });
      continue;
    }

    if (seen.has(placementId)) {
      errors.push({
        code: "duplicate-layer-order-placement",
        message: `Layer order references placement ${placementId} more than once.`,
        placement_id: placementId,
      });
      continue;
    }

    seen.add(placementId);
  }

  for (const placement of placements) {
    if (!seen.has(placement.id)) {
      errors.push({
        code: "missing-layer-order-placement",
        message: `Layer order is missing placement ${placement.id}.`,
        placement_id: placement.id,
      });
    }
  }

  return errors;
}

function hasDependencyCycle(
  placements: AssemblyDraftPlacement[],
  placementIds: Set<string>,
): boolean {
  const edges = new Map(placements.map((placement) => [placement.id, placement.requires_placed.filter((id) => placementIds.has(id))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (placementId: string): boolean => {
    if (visiting.has(placementId)) {
      return true;
    }
    if (visited.has(placementId)) {
      return false;
    }

    visiting.add(placementId);
    for (const requiredId of edges.get(placementId) ?? []) {
      if (visit(requiredId)) {
        return true;
      }
    }
    visiting.delete(placementId);
    visited.add(placementId);
    return false;
  };

  for (const placement of placements) {
    if (visit(placement.id)) {
      return true;
    }
  }
  return false;
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
