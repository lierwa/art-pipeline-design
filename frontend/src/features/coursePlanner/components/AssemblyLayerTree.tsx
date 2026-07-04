import { useMemo, type CSSProperties, type MouseEvent } from "react";
import { Layers3 } from "lucide-react";
import { Tree } from "react-arborist";

import {
  groupPlacements,
  movePlacementLayer,
  ungroupPlacementGroup,
  type AssemblyManifestDraft,
} from "../assembly/assemblyManifestDraft";

type AssemblyLayerTreeProps = {
  draft: AssemblyManifestDraft;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
};

type AssemblyLayerTreeNode = {
  id: string;
  kind: "group" | "placement";
  name: string;
  groupId: string | null;
  placementId: string | null;
  runtimeRole: string | null;
  children?: AssemblyLayerTreeNode[];
};

type ArboristMoveArgs = {
  dragIds: string[];
  parentId: string | null;
  index: number;
};

type ArboristNodeRendererProps = {
  node: {
    data: AssemblyLayerTreeNode;
    isInternal: boolean;
    isOpen: boolean;
    isLeaf: boolean;
    toggle: () => void;
  };
  style: CSSProperties;
  dragHandle?: (element: HTMLDivElement | null) => void;
};

// WHY: layer tree 是 authoring 边界，负责把扁平 manifest 的 layer_order/group metadata 投影成
// “可选、可分组、可拖拽”的树形交互；真正持久化仍只回写 placements/groups/layer_order 三份事实源，
// 不给 canvas 或 save 协议引入第二套 group transform 语义。
export function AssemblyLayerTree({
  draft,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
  selectedNodeIds,
  selectedPlacementId,
}: AssemblyLayerTreeProps) {
  const treeData = useMemo(() => buildLayerTreeData(draft), [draft]);
  const groupAction = useMemo(() => resolveGroupActionState(draft, selectedNodeIds), [draft, selectedNodeIds]);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const rowCount = useMemo(() => countTreeRows(treeData), [treeData]);

  function handleRowSelection(node: AssemblyLayerTreeNode, event: MouseEvent<HTMLButtonElement>) {
    const isMultiSelect = event.metaKey || event.ctrlKey;
    let nextSelectedIds: string[];

    if (isMultiSelect) {
      nextSelectedIds = selectedIdSet.has(node.id)
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
    } else {
      nextSelectedIds = [node.id];
    }

    onSelectNodeIds(nextSelectedIds);
    onSelectPlacement(node.kind === "placement" ? node.placementId : null);
  }

  function handleGroupSelected() {
    if (groupAction.kind !== "group") {
      return;
    }

    const nextGroupName = `Group ${draft.groups.length + 1}`;
    const groupedDraft = groupPlacements(draft, groupAction.placementIds, nextGroupName);
    if (groupedDraft === draft) {
      return;
    }

    const nextGroupId = groupedDraft.groups[groupedDraft.groups.length - 1]?.id ?? null;
    onDraftChange(groupedDraft);
    onSelectNodeIds(nextGroupId ? [nextGroupId] : []);
    onSelectPlacement(null);
  }

  function handleUngroupSelected() {
    if (groupAction.kind !== "ungroup") {
      return;
    }

    const nextDraft = ungroupPlacementGroup(draft, groupAction.groupId);
    if (nextDraft === draft) {
      return;
    }

    onDraftChange(nextDraft);
    onSelectNodeIds(groupAction.placementIds);
    onSelectPlacement(groupAction.placementIds[0] ?? null);
  }

  function handleMove({ dragIds, parentId, index }: ArboristMoveArgs) {
    const draggedId = dragIds[0] ?? null;
    if (!draggedId) {
      return;
    }

    const nextLayerOrder = computeMovedLayerOrder(treeData, draft.layer_order, draggedId, parentId, index);
    if (!nextLayerOrder || sameStringArray(nextLayerOrder, draft.layer_order)) {
      return;
    }

    const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
    let nextDraft = draft;
    nextLayerOrder.forEach((placementId, placementIndex) => {
      const currentIndex = nextDraft.layer_order.indexOf(placementId);
      if (currentIndex !== placementIndex && placementsById.has(placementId)) {
        nextDraft = movePlacementLayer(nextDraft, placementId, placementIndex);
      }
    });
    onDraftChange(nextDraft);
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack" aria-label="Assembly layers">
      <div className="chapter-studio-panel-heading">
        <div>
          <h2>Layers</h2>
          <p>Front to back</p>
        </div>
        <div className="assembly-layer-toolbar">
          <button
            type="button"
            className="course-planner-secondary-action chapter-studio-icon-action"
            disabled={groupAction.kind !== "group"}
            onClick={handleGroupSelected}
          >
            Group selected layers
          </button>
          <button
            type="button"
            className="course-planner-secondary-action chapter-studio-icon-action"
            disabled={groupAction.kind !== "ungroup"}
            onClick={handleUngroupSelected}
          >
            Ungroup selected layer
          </button>
          <span className="course-planner-status-badge course-planner-status-badge-neutral">
            <Layers3 size={14} aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="assembly-layer-tree-shell">
        <Tree
          data={treeData}
          height={Math.max(160, rowCount * 40)}
          width="100%"
          rowHeight={40}
          indent={18}
          openByDefault
          onMove={handleMove}
        >
          {({ node, style, dragHandle }: ArboristNodeRendererProps) => {
            const data = node.data;
            const isSelected = selectedIdSet.has(data.id) || (
              data.kind === "placement" &&
              data.placementId !== null &&
              data.placementId === selectedPlacementId &&
              selectedNodeIds.length <= 1
            );

            return (
              <div style={style} ref={dragHandle} className="assembly-layer-tree-row">
                <button
                  type="button"
                  className={`assembly-layer-row${isSelected ? " assembly-layer-row-selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={(event) => handleRowSelection(data, event)}
                >
                  <span className="assembly-layer-row-label">
                    {node.isInternal ? (
                      <span
                        className="assembly-layer-expander"
                        aria-hidden="true"
                        onClick={(event) => {
                          event.stopPropagation();
                          node.toggle();
                        }}
                      >
                        {node.isOpen ? "▾" : "▸"}
                      </span>
                    ) : (
                      <span className="assembly-layer-expander assembly-layer-expander-placeholder" aria-hidden="true">
                        ·
                      </span>
                    )}
                    <span>{data.name}</span>
                  </span>
                  {data.kind === "placement" && data.runtimeRole ? <small>{data.runtimeRole}</small> : null}
                </button>
              </div>
            );
          }}
        </Tree>
      </div>
    </section>
  );
}

function buildLayerTreeData(draft: AssemblyManifestDraft): AssemblyLayerTreeNode[] {
  const placementsById = new Map(draft.placements.map((placement) => [placement.id, placement]));
  const groupsById = new Map(draft.groups.map((group) => [group.id, group]));
  const emittedGroupIds = new Set<string>();

  return normalizePlacementOrder(draft).flatMap((placementId) => {
    const placement = placementsById.get(placementId);
    if (!placement) {
      return [];
    }

    if (!placement.group_id) {
      return [placementNodeFromDraft(placement)];
    }

    if (emittedGroupIds.has(placement.group_id)) {
      return [];
    }
    emittedGroupIds.add(placement.group_id);

    const group = groupsById.get(placement.group_id);
    if (!group) {
      return [placementNodeFromDraft(placement)];
    }

    const childNodes = normalizePlacementOrder(draft)
      .map((id) => placementsById.get(id))
      .filter((childPlacement): childPlacement is AssemblyManifestDraft["placements"][number] => (
        childPlacement !== undefined && childPlacement.group_id === group.id
      ))
      .map(placementNodeFromDraft);

    return [{
      id: group.id,
      kind: "group",
      name: group.display_name,
      groupId: group.id,
      placementId: null,
      runtimeRole: null,
      children: childNodes,
    }];
  });
}

function placementNodeFromDraft(placement: AssemblyManifestDraft["placements"][number]): AssemblyLayerTreeNode {
  return {
    id: placement.id,
    kind: "placement",
    name: placement.display_name,
    groupId: placement.group_id,
    placementId: placement.id,
    runtimeRole: placement.runtime_role,
  };
}

function normalizePlacementOrder(draft: AssemblyManifestDraft): string[] {
  const placementIds = draft.placements.map((placement) => placement.id);
  const orderedIds = draft.layer_order.filter((placementId) => placementIds.includes(placementId));
  return [...orderedIds, ...placementIds.filter((placementId) => !orderedIds.includes(placementId))];
}

function resolveGroupActionState(draft: AssemblyManifestDraft, selectedNodeIds: string[]) {
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

  const sharedGroupId = selectedPlacements[0]?.group_id ?? null;
  if (
    selectedGroups.length === 0 &&
    sharedGroupId &&
    selectedPlacements.length >= 1 &&
    selectedPlacements.every((placement) => placement.group_id === sharedGroupId)
  ) {
    const sourceGroup = draft.groups.find((group) => group.id === sharedGroupId);
    if (sourceGroup) {
      return {
        kind: "ungroup" as const,
        groupId: sourceGroup.id,
        placementIds: sourceGroup.placement_ids,
      };
    }
  }

  if (
    selectedGroups.length === 0 &&
    selectedPlacements.length >= 2 &&
    selectedPlacements.every((placement) => placement.group_id === null)
  ) {
    return {
      kind: "group" as const,
      placementIds: selectedPlacements.map((placement) => placement.id),
    };
  }

  return { kind: "idle" as const };
}

function countTreeRows(nodes: AssemblyLayerTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeRows(node.children ?? []), 0);
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
    if (parentId !== null) {
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

  const parentGroup = treeData.find((node) => node.id === parentId && node.kind === "group") ?? null;
  if (!parentGroup || !parentGroup.children?.some((child) => child.id === draggedId)) {
    return null;
  }

  const reorderedChildren = [...parentGroup.children];
  const dragIndex = reorderedChildren.findIndex((child) => child.id === draggedId);
  const [dragChild] = reorderedChildren.splice(dragIndex, 1);
  reorderedChildren.splice(clampIndex(index, reorderedChildren.length), 0, dragChild);

  const nextGroupOrder = reorderedChildren.map((child) => child.id);
  return replaceGroupPlacementsInLayerOrder(currentLayerOrder, parentGroup.id, nextGroupOrder, treeData);
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

function flattenNodePlacementIds(node: AssemblyLayerTreeNode): string[] {
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
