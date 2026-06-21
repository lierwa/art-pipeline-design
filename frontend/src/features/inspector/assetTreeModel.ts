import type { WorkspaceElement } from "../../domain/workspace";

export type AssetTreeReorderPosition = "before" | "after";

export type AssetTreeNode = {
  element: WorkspaceElement;
  children: AssetTreeNode[];
};

export type AssetTreeDropIntent = "inside" | AssetTreeReorderPosition;

export type AssetTreeDropPreview = {
  targetId: string;
  intent: AssetTreeDropIntent;
};

export type AssetTreeDropAction =
  | { kind: "parent" }
  | { kind: "reorder"; position: AssetTreeReorderPosition };

const ASSET_TREE_REORDER_EDGE_RATIO = 0.28;

export function buildAssetTree(elements: WorkspaceElement[]): AssetTreeNode[] {
  const nodeById = new Map<string, AssetTreeNode>();
  const childIdsByParent = new Map<string, string[]>();

  elements.forEach((element) => {
    nodeById.set(element.id, { element, children: [] });
  });

  elements.forEach((element) => {
    if (!element.parentId || !nodeById.has(element.parentId)) {
      return;
    }
    childIdsByParent.set(element.parentId, [
      ...(childIdsByParent.get(element.parentId) ?? []),
      element.id,
    ]);
  });

  childIdsByParent.forEach((childIds, parentId) => {
    const parent = nodeById.get(parentId);
    if (!parent) {
      return;
    }
    parent.children = childIds
      .map((childId) => nodeById.get(childId))
      .filter((node): node is AssetTreeNode => Boolean(node));
  });

  return elements
    .filter((element) => !element.parentId || !nodeById.has(element.parentId))
    .map((element) => nodeById.get(element.id))
    .filter((node): node is AssetTreeNode => Boolean(node));
}

export function collectExpandableIds(nodes: AssetTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length > 0 ? [node.element.id] : []),
    ...collectExpandableIds(node.children),
  ]);
}

export function flattenVisibleAssetTreeIds(nodes: AssetTreeNode[], expandedIds: Set<string>): string[] {
  return nodes.flatMap((node) => [
    node.element.id,
    ...(expandedIds.has(node.element.id) ? flattenVisibleAssetTreeIds(node.children, expandedIds) : []),
  ]);
}

export function resolveAssetTreeDropAction(
  elements: WorkspaceElement[],
  elementId: string,
  targetElementId: string,
  intent: AssetTreeDropIntent,
): AssetTreeDropAction | null {
  if (intent === "before" || intent === "after") {
    if (!canReorderElementNearTarget(elements, elementId, targetElementId)) {
      return null;
    }
    return { kind: "reorder", position: intent };
  }

  if (!canMoveElementToParent(elements, elementId, targetElementId)) {
    return null;
  }
  return { kind: "parent" };
}

export function getAssetTreeDropIntentFromOffset(offsetY: number, height: number): AssetTreeDropIntent {
  if (offsetY <= height * ASSET_TREE_REORDER_EDGE_RATIO) {
    return "before";
  }
  if (offsetY >= height * (1 - ASSET_TREE_REORDER_EDGE_RATIO)) {
    return "after";
  }
  return "inside";
}

export function canReorderElementNearTarget(
  elements: WorkspaceElement[],
  elementId: string,
  targetElementId: string,
): boolean {
  if (elementId === targetElementId) {
    return false;
  }

  const byId = new Map(elements.map((element) => [element.id, element]));
  const element = byId.get(elementId);
  const target = byId.get(targetElementId);
  if (!element || !target || !isActiveCandidate(element) || !isActiveCandidate(target)) {
    return false;
  }

  // WHY: 排序只调整同父级内的视觉顺序；跨父级关系继续交给中心落点的父子拖拽，避免一次拖动同时改变两个语义。
  return normalizeParentId(element.parentId) === normalizeParentId(target.parentId);
}

export function canMoveElementToParent(
  elements: WorkspaceElement[],
  elementId: string,
  parentId: string,
): boolean {
  if (elementId === parentId) {
    return false;
  }
  const byId = new Map(elements.map((element) => [element.id, element]));
  const element = byId.get(elementId);
  const parent = byId.get(parentId);
  if (!element || !parent || !isActiveCandidate(element) || !isActiveCandidate(parent)) {
    return false;
  }

  let currentParentId: string | null | undefined = parent.parentId;
  const seen = new Set<string>();
  while (currentParentId) {
    if (currentParentId === elementId) {
      return false;
    }
    if (seen.has(currentParentId)) {
      return false;
    }
    seen.add(currentParentId);
    currentParentId = byId.get(currentParentId)?.parentId;
  }
  return true;
}

export function isActiveCandidate(element: WorkspaceElement): boolean {
  return element.mergedInto === null && element.mode !== "rejected" && element.status !== "rejected";
}

export function formatConfidence(confidence: number | null | undefined): string {
  return typeof confidence === "number" ? confidence.toFixed(2) : "No score";
}

export function formatOriginLabel(element: WorkspaceElement): string {
  if (element.status === "edited") {
    return "Edited";
  }
  if (element.status === "child") {
    return "Manual child";
  }
  if (element.status === "merged") {
    return "Merged";
  }
  if (element.sourceProvider) {
    return "Model";
  }
  if (element.source === "manual") {
    return "Manual";
  }
  return "Workspace";
}

export function formatAssetBadgeLabel(element: WorkspaceElement): string {
  if (element.exportStatus === "ready" || element.exportStatus === "exported") {
    return "Export ready";
  }
  if (element.segmentationStatus === "mask_accepted") {
    return "Mask ready";
  }
  if (element.segmentationStatus === "mask_suggested") {
    return "Mask draft";
  }

  if (element.status === "exported") {
    return "Exported";
  }
  if (element.status === "repair_complete") {
    return "Repair complete";
  }
  if (element.status === "extracted") {
    return "Debug crop";
  }
  if (["accepted", "extract_ready"].includes(element.status)) {
    return "Ready for mask";
  }
  if (element.status === "rejected") {
    return "Rejected";
  }
  if (element.status === "edited") {
    return "Edited";
  }
  if (element.status === "child") {
    return "Child";
  }
  if (element.status === "merged") {
    return "Merged";
  }
  if (element.status === "split_parent") {
    return "Split source";
  }
  if (element.status === "repair_pending") {
    return "Repair task";
  }
  if (element.status === "qa_failed") {
    return "Fix required";
  }
  return "Detected";
}

export function statusToneClass(status: WorkspaceElement["status"]): string {
  if (["accepted", "exported", "extract_ready", "extracted", "repair_complete"].includes(status)) {
    return "asset-badge-success";
  }
  if (["rejected", "qa_failed"].includes(status)) {
    return "asset-badge-danger";
  }
  if (["edited", "child", "merged", "repair_pending"].includes(status)) {
    return "asset-badge-warning";
  }
  return "asset-badge-info";
}

function normalizeParentId(parentId: string | null | undefined): string | null {
  return parentId ?? null;
}
