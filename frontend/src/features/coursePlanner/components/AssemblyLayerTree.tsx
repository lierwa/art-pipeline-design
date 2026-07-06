import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  type KeyboardEvent,
} from "react";
import { ChevronDown, GripVertical, Layers3, Trash2 } from "lucide-react";
import {
  Tree,
  type NodeRendererProps,
  type TreeApi,
} from "react-arborist";

import { type AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import {
  buildLayerTreeData,
  countTreeRows,
  applyCollapsedGroups,
  createDeletedLayerNodeDraft,
  createGroupedSelectionDraft,
  createMovedLayerSelectionDraft,
  createSelectedLayerNodeState,
  createUngroupedSelectionDraft,
  flattenNodePlacementIds,
  flattenVisibleNodeIds,
  indexLayerNodes,
  isLayerNodeSelected,
  resolveGroupActionState,
  sameStringSet,
  type AssemblyLayerTreeNode,
} from "./assemblyLayerTreeModel";

type AssemblyLayerTreeProps = {
  draft: AssemblyManifestDraft;
  scenePackage: ChapterScenePackage;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
};

type PlacementSelectionEvent = {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

const ASSEMBLY_LAYER_ROW_HEIGHT = 64;

export function AssemblyLayerTree({
  draft,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
  scenePackage,
  selectedNodeIds,
  selectedPlacementId,
}: AssemblyLayerTreeProps) {
  const state = useAssemblyLayerTreeState(draft, selectedNodeIds, selectedPlacementId);
  const handlers = createAssemblyLayerTreeHandlers({
    draft,
    onDraftChange,
    onSelectNodeIds,
    onSelectPlacement,
    selectedNodeIds,
    selectedPlacementId,
    state,
  });

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack asset-tree-panel assembly-placement-list-panel" aria-label="Placement layers">
      <div className="chapter-studio-panel-heading assembly-layer-panel-heading">
        <div>
          <h2>Placement layers</h2>
          <p>Front to back</p>
        </div>
        <LayerGroupAction groupAction={state.groupAction} onAction={handlers.handleGroupAction} />
      </div>
      <div className="asset-tree-body assembly-layer-tree-body" ref={state.panelBodyRef}>
        <div className="asset-tree assembly-layer-list" role="tree" aria-label="Placement layer order">
          {state.tree.length > 0 ? (
            <Tree
              ref={state.treeRef}
              className="asset-tree-arborist"
              data={state.visibleTree}
              height={state.treeViewportHeight}
              indent={0}
              rowHeight={ASSEMBLY_LAYER_ROW_HEIGHT}
              selection={selectedPlacementId ?? undefined}
              width="100%"
              childrenAccessor={(node) => node.children ?? null}
              disableDrop={({ dragNodes, parentNode }) => {
                if (!parentNode?.data) {
                  return false;
                }
                return !(parentNode.data.kind === "group" && dragNodes[0]?.data.kind === "placement");
              }}
              idAccessor={(node) => node.id}
              onMove={handlers.handleLayerTreeMove}
              openByDefault
            >
              {(props) => (
                <PlacementLayerListRow
                  {...props}
                  collapsed={state.collapsedGroupIds.has(props.node.data.id)}
                  onDelete={handlers.handleDeleteLayerNode}
                  onSelect={handlers.handleRowSelection}
                  onToggleGroup={handlers.handleToggleGroup}
                  scenePackage={scenePackage}
                  selected={isLayerNodeSelected(props.node.data, state.selectedIdSet, selectedNodeIds, selectedPlacementId)}
                />
              )}
            </Tree>
          ) : <PlacementLayerEmptyState />}
        </div>
      </div>
    </section>
  );
}

function useAssemblyLayerTreeState(
  draft: AssemblyManifestDraft,
  selectedNodeIds: string[],
  selectedPlacementId: string | null,
) {
  const tree = useMemo(() => buildLayerTreeData(draft), [draft]);
  const treeRef = useRef<TreeApi<AssemblyLayerTreeNode>>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const visibleTree = useMemo(() => applyCollapsedGroups(tree, collapsedGroupIds), [collapsedGroupIds, tree]);
  const visibleNodeIds = useMemo(() => flattenVisibleNodeIds(visibleTree), [visibleTree]);
  const nodesById = useMemo(() => indexLayerNodes(tree), [tree]);
  const groupAction = useMemo(() => resolveGroupActionState(draft, selectedNodeIds), [draft, selectedNodeIds]);
  const treeFallbackHeight = Math.max(ASSEMBLY_LAYER_ROW_HEIGHT, countTreeRows(visibleTree) * ASSEMBLY_LAYER_ROW_HEIGHT);
  const [treeViewportHeight, setTreeViewportHeight] = useState(treeFallbackHeight);

  useEffect(() => {
    if (selectedPlacementId) {
      treeRef.current?.scrollTo(selectedPlacementId);
    }
  }, [selectedPlacementId, tree]);
  useEffect(() => pruneCollapsedGroupIds(draft, setCollapsedGroupIds), [draft.groups]);
  useEffect(() => syncLayerTreeHeight(panelBodyRef.current, treeFallbackHeight, setTreeViewportHeight), [treeFallbackHeight]);

  return {
    collapsedGroupIds,
    groupAction,
    nodesById,
    panelBodyRef,
    selectedIdSet,
    setCollapsedGroupIds,
    tree,
    treeRef,
    treeViewportHeight,
    visibleNodeIds,
    visibleTree,
  };
}

function createAssemblyLayerTreeHandlers({
  draft,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
  selectedNodeIds,
  selectedPlacementId,
  state,
}: {
  draft: AssemblyManifestDraft;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
  state: ReturnType<typeof useAssemblyLayerTreeState>;
}) {
  return {
    handleDeleteLayerNode: (node: AssemblyLayerTreeNode) => {
      deleteLayerNode({ draft, node, onDraftChange, onSelectNodeIds, onSelectPlacement, selectedNodeIds, selectedPlacementId });
    },
    handleGroupAction: () => {
      applyGroupAction({ draft, groupAction: state.groupAction, onDraftChange, onSelectNodeIds, onSelectPlacement });
    },
    handleLayerTreeMove: (move: { dragIds: string[]; index: number; parentId: unknown }) => {
      const result = createMovedLayerSelectionDraft(
        draft,
        state.tree,
        {
          dragIds: move.dragIds,
          index: move.index,
          parentId: typeof move.parentId === "string" ? move.parentId : null,
        },
        state.selectedIdSet,
        selectedNodeIds,
        state.nodesById,
      );
      if (result) {
        onDraftChange(result.draft);
        onSelectNodeIds(result.selectedNodeIds);
        onSelectPlacement(result.selectedPlacementId);
      }
    },
    handleRowSelection: (node: AssemblyLayerTreeNode, event: PlacementSelectionEvent) => {
      const result = createSelectedLayerNodeState(node, selectedNodeIds, state.selectedIdSet, {
        isMultiSelect: event.metaKey || event.ctrlKey,
        isRangeSelect: event.shiftKey,
        nodesById: state.nodesById,
        orderedIds: state.visibleNodeIds,
      });
      onSelectNodeIds(result.selectedNodeIds);
      onSelectPlacement(result.selectedPlacementId);
    },
    handleToggleGroup: (groupId: string) => toggleCollapsedGroup(groupId, state.setCollapsedGroupIds),
  };
}

function pruneCollapsedGroupIds(
  draft: AssemblyManifestDraft,
  setCollapsedGroupIds: Dispatch<SetStateAction<Set<string>>>,
) {
  const groupIds = new Set(draft.groups.map((group) => group.id));
  setCollapsedGroupIds((current) => {
    const next = new Set([...current].filter((groupId) => groupIds.has(groupId)));
    return sameStringSet(next, current) ? current : next;
  });
}

function syncLayerTreeHeight(
  body: HTMLDivElement | null,
  treeFallbackHeight: number,
  setTreeViewportHeight: Dispatch<SetStateAction<number>>,
) {
  if (!body) {
    setTreeViewportHeight(treeFallbackHeight);
    return;
  }

  function syncTreeHeight() {
    const measuredHeight = body?.clientHeight ?? 0;
    setTreeViewportHeight(
      measuredHeight > 0
        ? Math.max(ASSEMBLY_LAYER_ROW_HEIGHT, measuredHeight)
        : treeFallbackHeight,
    );
  }

  syncTreeHeight();
  if (typeof ResizeObserver === "undefined") {
    return;
  }

  const observer = new ResizeObserver(syncTreeHeight);
  observer.observe(body);
  return () => observer.disconnect();
}

function applyGroupAction({
  draft,
  groupAction,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
}: {
  draft: AssemblyManifestDraft;
  groupAction: ReturnType<typeof resolveGroupActionState>;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
}) {
  const result = groupAction.kind === "group"
    ? createGroupedSelectionDraft(draft, groupAction)
    : createUngroupedSelectionDraft(draft, groupAction);
  if (!result) {
    return;
  }
  onDraftChange(result.draft);
  onSelectNodeIds(result.selectedNodeIds);
  onSelectPlacement(
    "selectedPlacementId" in result && typeof result.selectedPlacementId === "string"
      ? result.selectedPlacementId
      : null,
  );
}

function deleteLayerNode({
  draft,
  node,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
  selectedNodeIds,
  selectedPlacementId,
}: {
  draft: AssemblyManifestDraft;
  node: AssemblyLayerTreeNode;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
}) {
  const result = createDeletedLayerNodeDraft(draft, node, selectedNodeIds, selectedPlacementId);
  if (!result) {
    return;
  }
  onDraftChange(result.draft);
  onSelectNodeIds(result.selectedNodeIds);
  onSelectPlacement(result.selectedPlacementId);
}

function toggleCollapsedGroup(
  groupId: string,
  setCollapsedGroupIds: Dispatch<SetStateAction<Set<string>>>,
) {
  setCollapsedGroupIds((current) => {
    const next = new Set(current);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    return next;
  });
}

function LayerGroupAction({
  groupAction,
  onAction,
}: {
  groupAction: ReturnType<typeof resolveGroupActionState>;
  onAction: () => void;
}) {
  if (groupAction.kind === "idle") {
    return null;
  }

  const label = groupAction.kind === "group" ? "Group selected layers" : "Ungroup selected layer";
  return (
    <div className="assembly-layer-panel-actions" role="toolbar" aria-label="Layer actions">
      <button
        type="button"
        className="course-planner-secondary-action assembly-layer-command"
        aria-label={label}
        title={label}
        onClick={onAction}
      >
        <Layers3 size={15} aria-hidden="true" />
        <span>{groupAction.kind === "group" ? "Group" : "Ungroup"}</span>
      </button>
    </div>
  );
}

function PlacementLayerListRow({
  collapsed,
  dragHandle,
  node,
  onDelete,
  onSelect,
  onToggleGroup,
  scenePackage,
  selected,
  style,
}: {
  collapsed: boolean;
  onDelete: (node: AssemblyLayerTreeNode) => void;
  onSelect: (node: AssemblyLayerTreeNode, event: PlacementSelectionEvent) => void;
  onToggleGroup: (groupId: string) => void;
  scenePackage: ChapterScenePackage;
  selected: boolean;
} & NodeRendererProps<AssemblyLayerTreeNode>) {
  const row = node.data;
  const rowAriaLabel = `${row.name} ${row.kind === "placement" ? row.runtimeRole : row.typeLabel ?? ""}`.trim();

  function handleSelectKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect(row, event);
  }

  function handleToggleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (row.kind === "group" && row.groupId) {
      onToggleGroup(row.groupId);
    }
  }

  return (
    <div
      style={style}
      className={[
        "asset-tree-item",
        "assembly-layer-item",
        selected ? "is-selected is-focused" : "",
        node.isDragging ? "is-dragging" : "",
        node.willReceiveDrop ? "is-drop-target" : "",
      ].filter(Boolean).join(" ")}
      role="treeitem"
      aria-selected={selected}
    >
      <div ref={dragHandle} className="asset-tree-row assembly-layer-row">
        <div className="asset-tree-row-depth" style={{ "--asset-depth": node.level } as CSSProperties}>
          {row.kind === "group" ? (
            <LayerCollapseToggle collapsed={collapsed} groupName={row.name} onClick={handleToggleClick} />
          ) : (
            <span className="asset-generate-toggle-spacer" aria-hidden="true" />
          )}
          <div
            className="asset-tree-select assembly-layer-row-select"
            role="button"
            tabIndex={0}
            aria-label={rowAriaLabel}
            aria-pressed={selected}
            onClick={(event) => onSelect(row, event)}
            onKeyDown={handleSelectKeyDown}
          >
            {row.assetId ? (
              <img
                className="asset-tree-thumb assembly-layer-thumb"
                alt=""
                src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", row.assetId)}
              />
            ) : (
              <span className="asset-tree-thumb assembly-layer-thumb assembly-layer-thumb-group" aria-hidden="true">
                <Layers3 size={16} />
              </span>
            )}
            <span className="asset-tree-copy">
              <strong>{row.name}</strong>
              {row.typeLabel ? <span>{row.typeLabel}</span> : null}
            </span>
          </div>
        </div>
        <span
          className="asset-tree-actions assembly-layer-row-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="assembly-layer-drag-affordance" title="Drag to reorder layers">
            <GripVertical size={16} strokeWidth={2.2} />
          </span>
          <LayerDeleteAction node={row} onDelete={onDelete} />
        </span>
      </div>
    </div>
  );
}

function LayerCollapseToggle({
  collapsed,
  groupName,
  onClick,
}: {
  collapsed: boolean;
  groupName: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const action = collapsed ? "Expand" : "Collapse";
  return (
    <button
      type="button"
      className="assembly-layer-collapse-button"
      aria-label={`${action} ${groupName} group`}
      aria-expanded={!collapsed}
      title={`${action} ${groupName} group`}
      onClick={onClick}
    >
      <ChevronDown
        size={14}
        aria-hidden="true"
        className={collapsed ? "assembly-layer-collapse-icon is-collapsed" : "assembly-layer-collapse-icon"}
      />
    </button>
  );
}

function LayerDeleteAction({
  node,
  onDelete,
}: {
  node: AssemblyLayerTreeNode;
  onDelete: (node: AssemblyLayerTreeNode) => void;
}) {
  const isGroup = node.kind === "group";
  const childCount = flattenNodePlacementIds(node).length;
  const deleteLabel = `Delete ${node.name} ${isGroup ? "group" : "placement"}`;
  return (
    <ConfirmActionDialog
      trigger={(
        <button
          type="button"
          className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button assembly-layer-delete-button"
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
      title={`Delete ${node.name}?`}
      description={isGroup
        ? `This deletes the group and its ${childCount} child ${childCount === 1 ? "placement" : "placements"}.`
        : "This removes the placement from layer order, groups, and dependency lists."}
      confirmLabel={isGroup ? "Confirm delete group" : "Confirm delete placement"}
      onConfirm={() => onDelete(node)}
    />
  );
}

function PlacementLayerEmptyState() {
  return (
    <div className="assembly-editor-empty-state assembly-editor-empty-state-compact">
      <Layers3 size={16} aria-hidden="true" />
      <div>
        <strong>No placements yet.</strong>
        <p>Add an available asset to create the first layer.</p>
      </div>
    </div>
  );
}

