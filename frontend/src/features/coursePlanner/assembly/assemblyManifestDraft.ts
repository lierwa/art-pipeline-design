import type {
  ChapterAsset,
  ChapterSceneAssemblyGroup,
  ChapterSceneAssemblyManifest,
  ChapterSceneAssemblyPlacement,
  ChapterSceneAssemblyTransform,
  ChapterScenePackage,
  RuntimeRole,
} from "../types";

type DraftAssetCatalog = Record<string, Pick<ChapterAsset, "display_name" | "status">>;

export type AssemblyDraftPlacement = ChapterSceneAssemblyPlacement;

export type AssemblyDraftGroup = ChapterSceneAssemblyGroup;

export type AssemblyManifestDraft = Omit<ChapterSceneAssemblyManifest, "placements" | "groups"> & {
  placements: AssemblyDraftPlacement[];
  groups: AssemblyDraftGroup[];
  asset_catalog: DraftAssetCatalog;
};

export type AssemblyDraftValidationError = {
  code: string;
  message: string;
  placement_id?: string;
};

export type AssemblyDraftValidation = {
  is_valid: boolean;
  errors: AssemblyDraftValidationError[];
};

export {
  arePlacementDependenciesSatisfiedAtStart,
  getPlacementDependencyOptionState,
  validateAssemblyDraft,
} from "./assemblyManifestValidation";

const DEFAULT_TRANSFORM: ChapterSceneAssemblyTransform = {
  cx: 0.5,
  cy: 0.5,
  w: 0.25,
  h: 0.25,
  rotation_deg: 0,
};
const MIN_NORMALIZED_SIZE = 0.001;

// WHY: 这个模块专门隔离 scene-package manifest 协议；canvas、layer tree、属性面板都只
// 读写一份纯 draft，而不是各自直接拼 backend payload，避免 authoring 细节扩散成持久化合同。
export function createAssemblyDraft(scenePackage: ChapterScenePackage): AssemblyManifestDraft {
  const currentEmptyScene = scenePackage.empty_scene_images.find(
    (image) => image.id === scenePackage.current_empty_scene_image_id,
  );

  return {
    ...scenePackage.assembly,
    empty_scene_image_id: scenePackage.current_empty_scene_image_id,
    empty_scene_size: currentEmptyScene
      ? { width: currentEmptyScene.width, height: currentEmptyScene.height }
      : scenePackage.assembly.empty_scene_size,
    placements: scenePackage.assembly.placements.map(clonePlacement),
    groups: scenePackage.assembly.groups.map(cloneGroup),
    layer_order: normalizeLayerOrder(scenePackage.assembly.placements, scenePackage.assembly.layer_order),
    asset_catalog: buildAssetCatalog(scenePackage),
  };
}

export function addAssetPlacement(draft: AssemblyManifestDraft, assetId: string): AssemblyManifestDraft {
  const asset = draft.asset_catalog[assetId];
  if (!asset || asset.status !== "available") {
    return draft;
  }

  const placementId = nextPlacementId(draft, assetId);
  const placement: AssemblyDraftPlacement = {
    id: placementId,
    asset_id: assetId,
    display_name: nextPlacementDisplayName(draft, assetId, asset.display_name),
    runtime_role: "target",
    transform: { ...DEFAULT_TRANSFORM },
    group_id: null,
    requires_placed: [],
  };

  return {
    ...draft,
    placements: [...draft.placements, placement],
    layer_order: [placementId, ...normalizeLayerOrder(draft.placements, draft.layer_order)],
  };
}

export function updatePlacementTransform(
  draft: AssemblyManifestDraft,
  placementId: string,
  transform: ChapterSceneAssemblyTransform,
): AssemblyManifestDraft {
  return {
    ...draft,
    placements: draft.placements.map((placement) => (
      placement.id === placementId
        ? { ...placement, transform: { ...transform } }
        : placement
    )),
  };
}

export function movePlacementLayer(
  draft: AssemblyManifestDraft,
  placementId: string,
  toIndex: number,
): AssemblyManifestDraft {
  const currentOrder = normalizeLayerOrder(draft.placements, draft.layer_order);
  const currentIndex = currentOrder.indexOf(placementId);
  if (currentIndex === -1) {
    return draft;
  }

  const nextOrder = [...currentOrder];
  nextOrder.splice(currentIndex, 1);
  nextOrder.splice(clampIndex(toIndex, nextOrder.length), 0, placementId);

  return { ...draft, layer_order: nextOrder };
}

export function movePlacementToGroup(
  draft: AssemblyManifestDraft,
  placementId: string,
  groupId: string,
  groupIndex: number,
): AssemblyManifestDraft {
  const placement = draft.placements.find((candidate) => candidate.id === placementId);
  const group = draft.groups.find((candidate) => candidate.id === groupId);
  if (!placement || !group || placement.group_id !== null) {
    return draft;
  }

  const currentOrder = normalizeLayerOrder(draft.placements, draft.layer_order);
  const currentGroupOrder = currentOrder.filter((candidateId) => {
    const candidate = draft.placements.find((item) => item.id === candidateId);
    return candidate?.group_id === groupId;
  });
  if (currentGroupOrder.length === 0) {
    return draft;
  }

  const nextGroupOrder = [...currentGroupOrder];
  nextGroupOrder.splice(clampIndex(groupIndex, nextGroupOrder.length), 0, placementId);
  const nextGroupIdSet = new Set(nextGroupOrder);
  const orderWithoutMovedPlacement = currentOrder.filter((candidateId) => candidateId !== placementId);
  const nextLayerOrder: string[] = [];
  let insertedGroupBlock = false;

  for (const candidateId of orderWithoutMovedPlacement) {
    if (nextGroupIdSet.has(candidateId)) {
      if (!insertedGroupBlock) {
        nextLayerOrder.push(...nextGroupOrder);
        insertedGroupBlock = true;
      }
      continue;
    }
    nextLayerOrder.push(candidateId);
  }

  // WHY: 分组成员顺序和 layer_order 必须在 manifest 边界一次性更新；
  // 否则 tree 与 canvas 会分别推导 group 内顺序，形成两个事实源。
  return {
    ...draft,
    placements: draft.placements.map((candidate) => (
      candidate.id === placementId
        ? { ...candidate, group_id: groupId }
        : candidate
    )),
    groups: draft.groups.map((candidate) => (
      candidate.id === groupId
        ? { ...candidate, placement_ids: nextGroupOrder }
        : candidate
    )),
    layer_order: insertedGroupBlock ? nextLayerOrder : currentOrder,
  };
}

export function removePlacement(draft: AssemblyManifestDraft, placementId: string): AssemblyManifestDraft {
  const remainingPlacements = draft.placements
    .filter((placement) => placement.id !== placementId)
    .map((placement) => ({
      ...placement,
      requires_placed: placement.requires_placed.filter((requiredId) => requiredId !== placementId),
    }));

  const normalizedGroups = draft.groups
    .map((group) => ({
      ...group,
      placement_ids: group.placement_ids.filter((id) => id !== placementId),
    }))
    .filter((group) => group.placement_ids.length >= 2);
  const validGroupIds = new Set(normalizedGroups.map((group) => group.id));

  return {
    ...draft,
    placements: remainingPlacements.map((placement) => (
      placement.group_id && !validGroupIds.has(placement.group_id)
        ? { ...placement, group_id: null }
        : placement
    )),
    groups: normalizedGroups,
    layer_order: normalizeLayerOrder(remainingPlacements, draft.layer_order.filter((id) => id !== placementId)),
  };
}

export function removePlacementGroup(draft: AssemblyManifestDraft, groupId: string): AssemblyManifestDraft {
  const group = draft.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    return draft;
  }

  const removedPlacementIds = new Set([
    ...group.placement_ids,
    ...draft.placements
      .filter((placement) => placement.group_id === groupId)
      .map((placement) => placement.id),
  ]);
  const remainingPlacements = draft.placements
    .filter((placement) => !removedPlacementIds.has(placement.id))
    .map((placement) => ({
      ...placement,
      requires_placed: placement.requires_placed.filter((requiredId) => !removedPlacementIds.has(requiredId)),
    }));

  // WHY: 删除 group 是破坏性命令而不是 ungroup；在 manifest 边界一次性删掉成员、
  // group 记录和依赖边，避免 Layer Tree 与属性面板各自实现一套删除语义。
  return {
    ...draft,
    placements: remainingPlacements,
    groups: draft.groups.filter((candidate) => candidate.id !== groupId),
    layer_order: normalizeLayerOrder(
      remainingPlacements,
      draft.layer_order.filter((placementId) => !removedPlacementIds.has(placementId)),
    ),
  };
}

export function setPlacementRuntimeRole(
  draft: AssemblyManifestDraft,
  placementIds: string[],
  role: RuntimeRole,
): AssemblyManifestDraft {
  const selectedIds = new Set(placementIds);
  return {
    ...draft,
    placements: draft.placements.map((placement) => (
      selectedIds.has(placement.id)
        ? { ...placement, runtime_role: role }
        : placement
    )),
  };
}

export function setPlacementDependencies(
  draft: AssemblyManifestDraft,
  placementId: string,
  requiredPlacementIds: string[],
): AssemblyManifestDraft {
  const dedupedDependencies = uniqueIds(requiredPlacementIds);
  return {
    ...draft,
    placements: draft.placements.map((placement) => (
      placement.id === placementId
        ? { ...placement, requires_placed: dedupedDependencies }
        : placement
    )),
  };
}

export function groupPlacements(
  draft: AssemblyManifestDraft,
  placementIds: string[],
  displayName: string,
): AssemblyManifestDraft {
  const uniquePlacementIds = uniqueIds(placementIds);
  if (uniquePlacementIds.length < 2) {
    return draft;
  }

  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const placements = uniquePlacementIds
    .map((placementId) => placementsById.get(placementId))
    .filter((placement): placement is AssemblyDraftPlacement => Boolean(placement));
  if (placements.length !== uniquePlacementIds.length || placements.some((placement) => placement.group_id)) {
    return draft;
  }

  const groupId = nextGroupId(draft);
  // WHY: 分组后的 layer_order 连续性属于 manifest 语义，不属于具体 UI。
  // layer tree、快捷键或未来 canvas 多选都必须得到同一份排序结果，避免各入口各自重排。
  const nextLayerOrder = makePlacementsContiguous(draft.layer_order, uniquePlacementIds);
  return {
    ...draft,
    placements: draft.placements.map((placement) => (
      uniquePlacementIds.includes(placement.id)
        ? { ...placement, group_id: groupId }
        : placement
    )),
    groups: [
      ...draft.groups,
      {
        id: groupId,
        display_name: displayName,
        placement_ids: uniquePlacementIds,
      },
    ],
    layer_order: nextLayerOrder,
  };
}

export function ungroupPlacementGroup(draft: AssemblyManifestDraft, groupId: string): AssemblyManifestDraft {
  if (!draft.groups.some((group) => group.id === groupId)) {
    return draft;
  }

  return {
    ...draft,
    placements: draft.placements.map((placement) => (
      placement.group_id === groupId
        ? { ...placement, group_id: null }
        : placement
    )),
    groups: draft.groups.filter((group) => group.id !== groupId),
  };
}

export function projectManifestForSave(draft: AssemblyManifestDraft): ChapterSceneAssemblyManifest {
  const placements = draft.placements.map((placement) => ({
    id: placement.id,
    asset_id: placement.asset_id,
    display_name: placement.display_name,
    runtime_role: placement.runtime_role,
    transform: clampTransform(placement.transform),
    group_id: placement.group_id,
    requires_placed: uniqueIds(placement.requires_placed),
  }));

  return {
    schema_version: 1,
    empty_scene_image_id: draft.empty_scene_image_id,
    empty_scene_size: draft.empty_scene_size
      ? { width: draft.empty_scene_size.width, height: draft.empty_scene_size.height }
      : null,
    placements,
    groups: draft.groups.map((group) => ({
      id: group.id,
      display_name: group.display_name,
      placement_ids: group.placement_ids.filter((placementId) => placements.some((placement) => placement.id === placementId)),
    })),
    // WHY: save 前必须先走 validateAssemblyDraft；这里保留 normalize 只为了创建态 / move helper 的
    // 容错投影，不负责替调用方吞掉坏 draft，否则 editor 会把协议错误静默持久化。
    // WHY: manifest 把 `layer_order[0]` 定义成 frontmost；真正绘制到 canvas/export 时再在渲染边界反向成
    // back-to-front。这里坚持只保存协议顺序，避免把某个 editor 的绘制实现反推成持久化字段语义。
    layer_order: normalizeLayerOrder(placements, draft.layer_order),
    updated_at: draft.updated_at,
  };
}

function buildAssetCatalog(scenePackage: ChapterScenePackage): DraftAssetCatalog {
  return Object.fromEntries(
    scenePackage.chapter_assets.map((asset) => [
      asset.id,
      {
        display_name: asset.display_name,
        status: asset.status,
      },
    ]),
  );
}

function normalizeLayerOrder(
  placements: Array<Pick<ChapterSceneAssemblyPlacement, "id">>,
  layerOrder: string[],
): string[] {
  const placementIds = new Set(placements.map((placement) => placement.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const placementId of layerOrder) {
    if (!placementIds.has(placementId) || seen.has(placementId)) {
      continue;
    }
    normalized.push(placementId);
    seen.add(placementId);
  }

  for (const placement of placements) {
    if (!seen.has(placement.id)) {
      normalized.push(placement.id);
      seen.add(placement.id);
    }
  }
  return normalized;
}

function nextPlacementId(draft: AssemblyManifestDraft, assetId: string): string {
  const baseId = `placement_${assetId}`;
  if (!draft.placements.some((placement) => placement.id === baseId)) {
    return baseId;
  }

  let counter = 2;
  while (draft.placements.some((placement) => placement.id === `${baseId}_${counter}`)) {
    counter += 1;
  }
  return `${baseId}_${counter}`;
}

function nextPlacementDisplayName(
  draft: AssemblyManifestDraft,
  assetId: string,
  assetDisplayName: string,
): string {
  const existingDisplayNames = new Set(
    draft.placements
      .filter((placement) => placement.asset_id === assetId)
      .map((placement) => placement.display_name),
  );
  if (!existingDisplayNames.has(assetDisplayName)) {
    return assetDisplayName;
  }

  let counter = 2;
  while (existingDisplayNames.has(`${assetDisplayName} ${counter}`)) {
    counter += 1;
  }
  return `${assetDisplayName} ${counter}`;
}

function nextGroupId(draft: AssemblyManifestDraft): string {
  let counter = 1;
  while (draft.groups.some((group) => group.id === `group_${counter}`)) {
    counter += 1;
  }
  return `group_${counter}`;
}

function clampTransform(transform: ChapterSceneAssemblyTransform): ChapterSceneAssemblyTransform {
  return {
    cx: clampNormalized(transform.cx),
    cy: clampNormalized(transform.cy),
    // WHY: backend 语义要求尺寸是严格大于 0 的归一化值；位置可以贴边为 0，但宽高如果落到 0 会把
    // 一个仍然存在的 placement 投影成非法协议，所以这里单独走正值下限而不是复用普通 normalized clamp。
    w: clampPositiveNormalized(transform.w),
    h: clampPositiveNormalized(transform.h),
    rotation_deg: transform.rotation_deg,
  };
}

function clampNormalized(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function clampPositiveNormalized(value: number): number {
  if (value <= 0) {
    return MIN_NORMALIZED_SIZE;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function clonePlacement(placement: AssemblyDraftPlacement): AssemblyDraftPlacement {
  return {
    ...placement,
    transform: { ...placement.transform },
    requires_placed: [...placement.requires_placed],
  };
}

function cloneGroup(group: AssemblyDraftGroup): AssemblyDraftGroup {
  return {
    ...group,
    placement_ids: [...group.placement_ids],
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function makePlacementsContiguous(layerOrder: string[], selectedPlacementIds: string[]): string[] {
  const selectedIdSet = new Set(selectedPlacementIds);
  const orderedSelection = layerOrder.filter((placementId) => selectedIdSet.has(placementId));
  if (orderedSelection.length <= 1) {
    return layerOrder;
  }

  const firstIndex = layerOrder.findIndex((placementId) => selectedIdSet.has(placementId));
  const remaining = layerOrder.filter((placementId) => !selectedIdSet.has(placementId));
  return [
    ...remaining.slice(0, firstIndex),
    ...orderedSelection,
    ...remaining.slice(firstIndex),
  ];
}

function clampIndex(index: number, max: number): number {
  if (index < 0) {
    return 0;
  }
  if (index > max) {
    return max;
  }
  return index;
}
