export type LayerTreeMoveNode = {
  id: string;
  kind?: string;
  children?: LayerTreeMoveNode[];
};

export type LayerTreeMoveRequest = {
  dragIds: string[];
  parentId: string | null;
  index: number;
  rootId?: string;
  canDrop?: (input: {
    dragNode: LayerTreeMoveNode;
    parentNode: LayerTreeMoveNode | null;
  }) => boolean;
};

export type ResolvedLayerTreeMove = {
  dragId: string;
  sourceParentId: string | null;
  parentId: string | null;
  index: number;
  siblingIds: string[];
};

export function resolveLayerTreeMove(
  nodes: LayerTreeMoveNode[],
  request: LayerTreeMoveRequest,
): ResolvedLayerTreeMove | null {
  const dragId = request.dragIds[0] ?? null;
  if (!dragId) {
    return null;
  }

  const index = indexLayerTree(nodes);
  const dragEntry = index.entriesById.get(dragId);
  if (!dragEntry) {
    return null;
  }

  const parentId = normalizeTreeParentId(request.parentId, request.rootId);
  const parentEntry = parentId ? index.entriesById.get(parentId) : null;
  if (parentId && !parentEntry) {
    return null;
  }
  if (parentId && isDescendantOf(index.entriesById, parentId, dragId)) {
    return null;
  }

  const parentNode = parentEntry?.node ?? null;
  if (request.canDrop && !request.canDrop({ dragNode: dragEntry.node, parentNode })) {
    return null;
  }

  const destinationSiblings = [...(parentId ? parentEntry?.childIds ?? [] : index.rootIds)];
  const existingIndex = destinationSiblings.indexOf(dragId);
  if (existingIndex !== -1) {
    destinationSiblings.splice(existingIndex, 1);
  }
  const nextIndex = clampIndex(request.index, destinationSiblings.length);
  destinationSiblings.splice(nextIndex, 0, dragId);

  return {
    dragId,
    sourceParentId: dragEntry.parentId,
    parentId,
    index: nextIndex,
    siblingIds: destinationSiblings,
  };
}

export function projectLayerOrderForHitTest(layerOrder: string[]): string[] {
  // WHY: authoring 协议把 layer_order[0] 固定为 frontmost；hit-test 应直接按
  // front-to-back 扫描，只有绘制边界才需要反向成 back-to-front。
  return [...layerOrder];
}

type LayerTreeIndexEntry = {
  node: LayerTreeMoveNode;
  parentId: string | null;
  childIds: string[];
};

function indexLayerTree(nodes: LayerTreeMoveNode[]) {
  const entriesById = new Map<string, LayerTreeIndexEntry>();
  const rootIds = nodes.map((node) => node.id);

  function visit(node: LayerTreeMoveNode, parentId: string | null) {
    const children = node.children ?? [];
    entriesById.set(node.id, {
      node,
      parentId,
      childIds: children.map((child) => child.id),
    });
    children.forEach((child) => visit(child, node.id));
  }

  nodes.forEach((node) => visit(node, null));
  return { entriesById, rootIds };
}

function normalizeTreeParentId(parentId: string | null, rootId: string | undefined): string | null {
  return parentId === rootId ? null : parentId;
}

function isDescendantOf(
  entriesById: Map<string, LayerTreeIndexEntry>,
  nodeId: string,
  possibleAncestorId: string,
): boolean {
  let currentParentId = entriesById.get(nodeId)?.parentId ?? null;
  const seen = new Set<string>();
  while (currentParentId) {
    if (currentParentId === possibleAncestorId) {
      return true;
    }
    if (seen.has(currentParentId)) {
      return true;
    }
    seen.add(currentParentId);
    currentParentId = entriesById.get(currentParentId)?.parentId ?? null;
  }
  return false;
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
