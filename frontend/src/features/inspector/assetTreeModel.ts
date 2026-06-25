import type { WorkspaceElement } from "../../domain/workspace";

export type AssetTreeReorderPosition = "before" | "after";

export type AssetTreeNode = {
  element: WorkspaceElement;
  children: AssetTreeNode[];
};

export type AssetTreeMoveAction =
  | { kind: "parent"; parentId: string | null }
  | { kind: "reorder"; targetElementId: string; position: AssetTreeReorderPosition };

export function isAssetTreeDropDisabled(
  source: WorkspaceElement | null | undefined,
  parent: WorkspaceElement | null | undefined,
): boolean {
  if (!source || !isActiveCandidate(source)) {
    return true;
  }
  // WHY: react-arborist 会把根区域和部分虚拟 drop 位置表达成没有业务 element 的
  // parent；这里把它收敛为“落回根层级”，避免外部库协议泄漏进资产状态判断。
  if (!parent) {
    return false;
  }
  return !isActiveCandidate(parent);
}

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

export function resolveAssetTreeMoveAction(
  elements: WorkspaceElement[],
  elementId: string,
  parentId: string | null,
  index: number,
): AssetTreeMoveAction | null {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const element = byId.get(elementId);
  if (!element || !isActiveCandidate(element)) {
    return null;
  }

  const normalizedParentId = normalizeParentId(parentId);
  const currentParentId = normalizeParentId(element.parentId);
  if (normalizedParentId !== currentParentId) {
    if (normalizedParentId !== null && !canMoveElementToParent(elements, elementId, normalizedParentId)) {
      return null;
    }
    // WHY: react-arborist 已经负责可靠判断“落到哪个父级”；这里仅把外部库协议
    // 收敛成工作区唯一的父子关系 mutation，避免前端再维护第二套 hover 语义。
    return { kind: "parent", parentId: normalizedParentId };
  }

  const siblings = elements.filter(
    (candidate) =>
      candidate.id !== elementId
      && candidate.mergedInto === null
      && normalizeParentId(candidate.parentId) === currentParentId,
  );
  if (siblings.length === 0) {
    return null;
  }

  const clampedIndex = Math.max(0, Math.min(index, siblings.length));
  if (clampedIndex === 0) {
    const target = siblings[0];
    return canReorderElementNearTarget(elements, elementId, target.id)
      ? { kind: "reorder", targetElementId: target.id, position: "before" }
      : null;
  }

  if (clampedIndex >= siblings.length) {
    const target = siblings[siblings.length - 1];
    return canReorderElementNearTarget(elements, elementId, target.id)
      ? { kind: "reorder", targetElementId: target.id, position: "after" }
      : null;
  }

  const target = siblings[clampedIndex];
  return canReorderElementNearTarget(elements, elementId, target.id)
    ? { kind: "reorder", targetElementId: target.id, position: "before" }
    : null;
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
  if (element.segmentationStatus === "mask_suggested" || element.segmentationStatus === "mask_editing") {
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

export function statusTagTone(status: WorkspaceElement["status"]): "success" | "danger" | "warning" | "info" {
  if (["accepted", "exported", "extract_ready", "extracted", "repair_complete"].includes(status)) {
    return "success";
  }
  if (["rejected", "qa_failed"].includes(status)) {
    return "danger";
  }
  if (["edited", "child", "merged", "repair_pending"].includes(status)) {
    return "warning";
  }
  return "info";
}

function normalizeParentId(parentId: string | null | undefined): string | null {
  return parentId ?? null;
}
