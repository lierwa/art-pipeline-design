import {
  groupPlacements,
  movePlacementToGroup,
  movePlacementOutOfGroup,
  movePlacementLayer,
  removePlacement,
  removePlacementGroup,
  ungroupPlacementGroup,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";
import {
  resolveLayerTreeMove,
  type LayerTreeMoveNode,
} from "../../authoring/layerTreeMoveModel";
import { reduceSelection } from "../../authoring/selectionModel";
import { readableAssemblyPlacementName } from "./assemblyDisplayNames";

export type AssemblyLayerTreeNode = {
  id: string;
  assetId: string | null;
  kind: "group" | "placement";
  name: string;
  typeLabel: string | null;
  groupId: string | null;
  placementId: string | null;
  runtimeRole: string | null;
  children?: AssemblyLayerTreeNode[];
};

export type ArboristMoveArgs = {
  dragIds: string[];
  parentId: string | null;
  index: number;
};

export type AssemblyLayerDropTarget = {
  id: string;
  parentId: string | null;
  index: number;
  kind: "root" | "group-child";
  label: string;
};

const REACT_ARBORIST_ROOT_ID = "__REACT_ARBORIST_INTERNAL_ROOT__";
const EMPTY_ASSET_NAME_BY_ID: ReadonlyMap<string, string> = new Map();

export function buildLayerTreeData(
  draft: AssemblyManifestDraft,
  assetNameById: ReadonlyMap<string, string> = EMPTY_ASSET_NAME_BY_ID,
): AssemblyLayerTreeNode[] {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const groupsById = new Map(draft.groups.map((group) => [group.id, group]));
  const emittedGroupIds = new Set<string>();

  return normalizePlacementOrder(draft).flatMap((placementId) => {
    const placement = placementsById.get(placementId);
    if (!placement) {
      return [];
    }

    if (!placement.group_id) {
      return [placementNodeFromDraft(placement, assetNameById)];
    }

    if (emittedGroupIds.has(placement.group_id)) {
      return [];
    }
    emittedGroupIds.add(placement.group_id);

    const group = groupsById.get(placement.group_id);
    return group
      ? [groupNodeFromDraft(draft, group.id, group.display_name, assetNameById)]
      : [placementNodeFromDraft(placement, assetNameById)];
  });
}

export function resolveGroupActionState(draft: AssemblyManifestDraft, selectedNodeIds: string[]) {
  const selectedIdSet = new Set(selectedNodeIds);
  const selectedGroups = draft.groups.filter((group) => selectedIdSet.has(group.id));
  const selectedPlacements = normalizePlacementOrder(draft)
    .map((placementId) => draft.placements.find((placement) => placement.id === placementId))
    .filter((placement): placement is AssemblyManifestDraft["placements"][number] => (
      placement !== undefined && selectedIdSet.has(placement.id)
    ));

  const selectedGroup = selectedGroups[0];
  if (selectedGroup && selectedGroups.length === 1 && selectedNodeIds.length === 1) {
    return {
      kind: "ungroup" as const,
      groupId: selectedGroup.id,
      placementIds: selectedGroup.placement_ids,
    };
  }

  return resolvePlacementGroupAction(draft, selectedGroups.length, selectedPlacements);
}

export function createGroupedSelectionDraft(
  draft: AssemblyManifestDraft,
  groupAction: ReturnType<typeof resolveGroupActionState>,
) {
  if (groupAction.kind !== "group") {
    return null;
  }

  const nextDraft = groupPlacements(draft, groupAction.placementIds, `Group ${draft.groups.length + 1}`);
  if (nextDraft === draft) {
    return null;
  }
  const nextGroupId = nextDraft.groups[nextDraft.groups.length - 1]?.id ?? null;
  return { draft: nextDraft, selectedNodeIds: nextGroupId ? [nextGroupId] : [] };
}

export function createUngroupedSelectionDraft(
  draft: AssemblyManifestDraft,
  groupAction: ReturnType<typeof resolveGroupActionState>,
) {
  if (groupAction.kind !== "ungroup") {
    return null;
  }

  const nextDraft = ungroupPlacementGroup(draft, groupAction.groupId);
  if (nextDraft === draft) {
    return null;
  }
  return {
    draft: nextDraft,
    selectedNodeIds: groupAction.placementIds,
    selectedPlacementId: groupAction.placementIds[0] ?? null,
  };
}

export function createDeletedLayerNodeDraft(
  draft: AssemblyManifestDraft,
  node: AssemblyLayerTreeNode,
  selectedNodeIds: string[],
  selectedPlacementId: string | null,
) {
  const deletedPlacementIds = flattenNodePlacementIds(node);
  const deletedNodeIds = new Set([node.id, ...deletedPlacementIds]);
  const nextDraft = node.kind === "group" && node.groupId
    ? removePlacementGroup(draft, node.groupId)
    : node.placementId
      ? removePlacement(draft, node.placementId)
      : draft;
  if (nextDraft === draft) {
    return null;
  }

  return {
    draft: nextDraft,
    selectedNodeIds: selectedNodeIds.filter((id) => !deletedNodeIds.has(id)),
    selectedPlacementId: selectedPlacementId && !deletedPlacementIds.includes(selectedPlacementId)
      ? selectedPlacementId
      : null,
  };
}

export function createMovedLayerDraft(
  draft: AssemblyManifestDraft,
  treeData: AssemblyLayerTreeNode[],
  { dragIds, index, parentId }: ArboristMoveArgs,
): AssemblyManifestDraft | null {
  const draggedId = dragIds[0] ?? null;
  if (!draggedId) {
    return null;
  }

  const move = resolveLayerTreeMove(toLayerTreeMoveNodes(treeData), {
    dragIds,
    parentId,
    index,
    rootId: REACT_ARBORIST_ROOT_ID,
    canDrop: ({ dragNode, parentNode }) => parentNode === null || (
      dragNode.kind === "placement" && parentNode.kind === "group"
    ),
  });
  if (!move) {
    return null;
  }

  if (move.sourceParentId !== null && move.parentId === null) {
    const nextDraft = movePlacementOutOfGroup(draft, move.dragId, move.index);
    return nextDraft === draft ? null : nextDraft;
  }

  if (move.sourceParentId === null && move.parentId && isRootPlacement(treeData, move.dragId)) {
    // WHY: `group-end` is now an explicit droppable inside the expanded group. Treating
    // group end as root-after-group makes the visual drop line lie about the result.
    // Root-level drops must come from root drop targets (`parentId === null`) instead.
    const nextDraft = movePlacementToGroup(draft, move.dragId, move.parentId, move.index);
    return nextDraft === draft ? null : nextDraft;
  }

  const nextGroupPlacementOrder = computeMovedGroupPlacementOrder(treeData, move.dragId, move.parentId, move.index);
  const nextLayerOrder = computeMovedLayerOrder(treeData, draft.layer_order, move.dragId, move.parentId, move.index);
  if (!nextLayerOrder || sameStringArray(nextLayerOrder, draft.layer_order)) {
    return null;
  }

  let nextDraft = applyLayerOrder(draft, nextLayerOrder);
  if (nextGroupPlacementOrder) {
    // WHY: group child reorder changes two manifest facts. Updating only layer_order leaves
    // groups[].placement_ids stale, so subsequent saves and reloads can disagree about child order.
    nextDraft = {
      ...nextDraft,
      groups: nextDraft.groups.map((group) => (
        group.id === nextGroupPlacementOrder.groupId
          ? { ...group, placement_ids: nextGroupPlacementOrder.placementIds }
          : group
      )),
    };
  }
  return nextDraft;
}

export function createSelectedLayerNodeState(
  node: AssemblyLayerTreeNode,
  selectedNodeIds: string[],
  selectedIdSet: Set<string>,
  options: {
    isMultiSelect: boolean;
    isRangeSelect: boolean;
    nodesById: Map<string, AssemblyLayerTreeNode>;
    orderedIds: string[];
  },
) {
  const nextSelectedIds = resolveNextSelection(
    node.id,
    selectedNodeIds,
    selectedIdSet,
    options.isMultiSelect,
    {
      isRangeSelect: options.isRangeSelect,
      orderedIds: options.orderedIds,
    },
  );
  return {
    selectedNodeIds: nextSelectedIds,
    selectedPlacementId: resolvePrimaryPlacementId(node, nextSelectedIds, options.nodesById),
  };
}

export function createMovedLayerSelectionDraft(
  draft: AssemblyManifestDraft,
  treeData: AssemblyLayerTreeNode[],
  move: ArboristMoveArgs,
  selectedIdSet: Set<string>,
  selectedNodeIds: string[],
  nodesById: Map<string, AssemblyLayerTreeNode>,
) {
  const draggedId = move.dragIds[0] ?? null;
  if (!draggedId) {
    return null;
  }
  const nextDraft = createMovedLayerDraft(draft, treeData, move);
  if (!nextDraft) {
    return null;
  }

  const draggedNode = nodesById.get(draggedId) ?? null;
  const nextSelectedIds = selectedIdSet.has(draggedId) ? selectedNodeIds : [draggedId];
  return {
    draft: nextDraft,
    selectedNodeIds: nextSelectedIds,
    selectedPlacementId: draggedNode ? resolvePrimaryPlacementId(draggedNode, nextSelectedIds, nodesById) : null,
  };
}

export function buildLayerDropTargets(treeData: AssemblyLayerTreeNode[]): AssemblyLayerDropTarget[] {
  const targets: AssemblyLayerDropTarget[] = [];
  treeData.forEach((node, rootIndex) => {
    targets.push(rootDropTarget(node, rootIndex));
    if (node.kind === "group" && node.groupId) {
      (node.children ?? []).forEach((child, childIndex) => {
        targets.push(groupChildDropTarget(node, child, childIndex));
      });
      targets.push(groupEndDropTarget(node));
    }
  });
  targets.push({
    id: "root-end",
    parentId: null,
    index: treeData.length,
    kind: "root",
    label: "Drop at root end",
  });
  return targets;
}

export function countTreeRows(nodes: AssemblyLayerTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeRows(node.children ?? []), 0);
}

export function isLayerNodeSelected(
  node: AssemblyLayerTreeNode,
  selectedIdSet: Set<string>,
  selectedNodeIds: string[],
  selectedPlacementId: string | null,
): boolean {
  return selectedIdSet.has(node.id) || (
    node.kind === "placement" &&
    node.placementId !== null &&
    node.placementId === selectedPlacementId &&
    selectedNodeIds.length <= 1
  );
}

export function resolveNextSelection(
  nodeId: string,
  selectedNodeIds: string[],
  _selectedIdSet: Set<string>,
  isMultiSelect: boolean,
  options: {
    isRangeSelect?: boolean;
    orderedIds?: string[];
  } = {},
): string[] {
  const nextSelection = reduceSelection(
    {
      selectedIds: selectedNodeIds,
      primaryId: selectedNodeIds[selectedNodeIds.length - 1] ?? null,
      anchorId: selectedNodeIds[0] ?? null,
    },
    options.isRangeSelect
      ? { type: "range", id: nodeId, orderedIds: options.orderedIds ?? selectedNodeIds }
      : { type: isMultiSelect ? "toggle" : "replace", id: nodeId },
  );
  return nextSelection.selectedIds;
}

export function flattenVisibleNodeIds(nodes: AssemblyLayerTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...flattenVisibleNodeIds(node.children ?? []),
  ]);
}

export function applyCollapsedGroups(
  nodes: AssemblyLayerTreeNode[],
  collapsedGroupIds: Set<string>,
): AssemblyLayerTreeNode[] {
  return nodes.map((node) => {
    if (node.kind !== "group" || !node.groupId || !collapsedGroupIds.has(node.groupId)) {
      return node.children
        ? { ...node, children: applyCollapsedGroups(node.children, collapsedGroupIds) }
        : node;
    }
    return { ...node, children: [] };
  });
}

export function indexLayerNodes(nodes: AssemblyLayerTreeNode[]): Map<string, AssemblyLayerTreeNode> {
  const result = new Map<string, AssemblyLayerTreeNode>();
  function visit(node: AssemblyLayerTreeNode) {
    result.set(node.id, node);
    (node.children ?? []).forEach(visit);
  }
  nodes.forEach(visit);
  return result;
}

export function resolvePrimaryPlacementId(
  activeNode: AssemblyLayerTreeNode,
  selectedIds: string[],
  nodesById: Map<string, AssemblyLayerTreeNode>,
): string | null {
  if (activeNode.kind === "placement" && selectedIds.includes(activeNode.id)) {
    return activeNode.placementId;
  }
  for (let index = selectedIds.length - 1; index >= 0; index -= 1) {
    const node = nodesById.get(selectedIds[index]);
    if (node?.kind === "placement") {
      return node.placementId;
    }
  }
  return null;
}

export function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function groupNodeFromDraft(
  draft: AssemblyManifestDraft,
  groupId: string,
  groupName: string,
  assetNameById: ReadonlyMap<string, string>,
): AssemblyLayerTreeNode {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const childNodes = normalizePlacementOrder(draft)
    .map((id) => placementsById.get(id))
    .filter((placement): placement is AssemblyManifestDraft["placements"][number] => (
      placement !== undefined && placement.group_id === groupId
    ))
    .map((placement) => placementNodeFromDraft(placement, assetNameById));

  return {
    id: groupId,
    assetId: null,
    kind: "group",
    name: groupName,
    typeLabel: "Group",
    groupId,
    placementId: null,
    runtimeRole: null,
    children: childNodes,
  };
}

function placementNodeFromDraft(
  placement: AssemblyManifestDraft["placements"][number],
  assetNameById: ReadonlyMap<string, string>,
): AssemblyLayerTreeNode {
  return {
    id: placement.id,
    assetId: placement.asset_id,
    kind: "placement",
    name: readableAssemblyPlacementName(placement, assetNameById),
    typeLabel: placement.runtime_role === "target" ? "Target" : "Initial",
    groupId: placement.group_id,
    placementId: placement.id,
    runtimeRole: placement.runtime_role,
  };
}

function rootDropTarget(node: AssemblyLayerTreeNode, rootIndex: number): AssemblyLayerDropTarget {
  return {
    id: `root-before-${node.id}`,
    parentId: null,
    index: rootIndex,
    kind: "root",
    label: `Drop at root before ${node.name}`,
  };
}

function groupChildDropTarget(
  groupNode: AssemblyLayerTreeNode,
  childNode: AssemblyLayerTreeNode,
  childIndex: number,
): AssemblyLayerDropTarget {
  return {
    id: `group-${groupNode.id}-before-${childNode.id}`,
    parentId: groupNode.id,
    index: childIndex,
    kind: "group-child",
    label: `Drop into ${groupNode.name} at position ${childIndex + 1}`,
  };
}

function groupEndDropTarget(groupNode: AssemblyLayerTreeNode): AssemblyLayerDropTarget {
  return {
    id: `group-${groupNode.id}-end`,
    parentId: groupNode.id,
    index: groupNode.children?.length ?? 0,
    kind: "group-child",
    label: `Drop into ${groupNode.name} at end`,
  };
}

function normalizePlacementOrder(draft: AssemblyManifestDraft): string[] {
  const placementIds = draft.placements.map((placement) => placement.id);
  const orderedIds = draft.layer_order.filter((placementId) => placementIds.includes(placementId));
  return [...orderedIds, ...placementIds.filter((placementId) => !orderedIds.includes(placementId))];
}

function resolvePlacementGroupAction(
  draft: AssemblyManifestDraft,
  selectedGroupCount: number,
  selectedPlacements: AssemblyManifestDraft["placements"],
) {
  const sharedGroupId = selectedPlacements[0]?.group_id ?? null;
  if (selectedGroupCount === 0 && sharedGroupId && selectedPlacements.every((item) => item.group_id === sharedGroupId)) {
    const sourceGroup = draft.groups.find((group) => group.id === sharedGroupId);
    if (sourceGroup) {
      return {
        kind: "ungroup" as const,
        groupId: sourceGroup.id,
        placementIds: sourceGroup.placement_ids,
      };
    }
  }

  if (selectedGroupCount === 0 && selectedPlacements.length >= 2 && selectedPlacements.every((item) => item.group_id === null)) {
    return {
      kind: "group" as const,
      placementIds: selectedPlacements.map((placement) => placement.id),
    };
  }

  return { kind: "idle" as const };
}

function computeMovedLayerOrder(
  treeData: AssemblyLayerTreeNode[],
  currentLayerOrder: string[],
  draggedId: string,
  parentId: string | null,
  index: number,
): string[] | null {
  const rootNode = treeData.find((node) => node.id === draggedId) ?? null;
  if (rootNode) {
    return moveRootNodeBlock(treeData, draggedId, parentId, index);
  }

  const parentGroup = treeData.find((node) => node.id === parentId && node.kind === "group") ?? null;
  if (!parentGroup || !parentGroup.children?.some((child) => child.id === draggedId)) {
    return null;
  }

  const nextGroupOrder = reorderGroupChildren(parentGroup.children, draggedId, index);
  return replaceGroupPlacementsInLayerOrder(currentLayerOrder, parentGroup.id, nextGroupOrder, treeData);
}

function computeMovedGroupPlacementOrder(
  treeData: AssemblyLayerTreeNode[],
  draggedId: string,
  parentId: string | null,
  index: number,
): { groupId: string; placementIds: string[] } | null {
  const parentGroup = treeData.find((node) => node.id === parentId && node.kind === "group") ?? null;
  if (!parentGroup || !parentGroup.children?.some((child) => child.id === draggedId)) {
    return null;
  }

  return {
    groupId: parentGroup.id,
    placementIds: reorderGroupChildren(parentGroup.children, draggedId, index),
  };
}

function toLayerTreeMoveNodes(nodes: AssemblyLayerTreeNode[]): LayerTreeMoveNode[] {
  return nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    children: node.children ? toLayerTreeMoveNodes(node.children) : undefined,
  }));
}

function isRootPlacement(treeData: AssemblyLayerTreeNode[], nodeId: string): boolean {
  return treeData.some((node) => node.id === nodeId && node.kind === "placement");
}

function moveRootNodeBlock(
  treeData: AssemblyLayerTreeNode[],
  draggedId: string,
  parentId: string | null,
  index: number,
): string[] | null {
  const normalizedParentId = parentId === REACT_ARBORIST_ROOT_ID ? null : parentId;
  if (normalizedParentId !== null) {
    return null;
  }
  const rootBlocks = treeData.map((node) => flattenNodePlacementIds(node));
  const dragIndex = treeData.findIndex((node) => node.id === draggedId);
  if (dragIndex === -1) {
    return null;
  }
  const nextBlocks = [...rootBlocks];
  const [dragBlock] = nextBlocks.splice(dragIndex, 1);
  nextBlocks.splice(clampIndex(index, nextBlocks.length), 0, dragBlock);
  return nextBlocks.flat();
}

function reorderGroupChildren(
  children: AssemblyLayerTreeNode[],
  draggedId: string,
  index: number,
): string[] {
  const reorderedChildren = [...children];
  const dragIndex = reorderedChildren.findIndex((child) => child.id === draggedId);
  const [dragChild] = reorderedChildren.splice(dragIndex, 1);
  reorderedChildren.splice(clampIndex(index, reorderedChildren.length), 0, dragChild);
  return reorderedChildren.map((child) => child.id);
}

function replaceGroupPlacementsInLayerOrder(
  layerOrder: string[],
  groupId: string,
  nextGroupOrder: string[],
  treeData: AssemblyLayerTreeNode[],
): string[] {
  const sourceGroup = treeData.find((node) => node.id === groupId && node.kind === "group");
  const currentGroupIds = new Set((sourceGroup?.children ?? []).map((child) => child.id));
  const nextLayerOrder: string[] = [];
  let inserted = false;

  for (const placementId of layerOrder) {
    if (currentGroupIds.has(placementId)) {
      if (!inserted) {
        nextLayerOrder.push(...nextGroupOrder);
        inserted = true;
      }
      continue;
    }
    nextLayerOrder.push(placementId);
  }

  return inserted ? nextLayerOrder : layerOrder;
}

function applyLayerOrder(draft: AssemblyManifestDraft, nextLayerOrder: string[]): AssemblyManifestDraft {
  let nextDraft = draft;
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  nextLayerOrder.forEach((placementId, placementIndex) => {
    const currentIndex = nextDraft.layer_order.indexOf(placementId);
    if (currentIndex !== placementIndex && placementsById.has(placementId)) {
      nextDraft = movePlacementLayer(nextDraft, placementId, placementIndex);
    }
  });
  return nextDraft;
}

export function flattenNodePlacementIds(node: AssemblyLayerTreeNode): string[] {
  if (node.kind === "placement" && node.placementId) {
    return [node.placementId];
  }
  return (node.children ?? []).flatMap((child) => flattenNodePlacementIds(child));
}

function clampIndex(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
