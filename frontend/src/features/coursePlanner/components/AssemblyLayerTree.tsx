import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronDown, Eye, EyeOff, Folder, Layers3, Trash2 } from "lucide-react";

import { type AssemblyManifestDraft } from "../assembly/assemblyManifestDraft";
import { scenePackageMediaUrl } from "../scenePackageMedia";
import type { ChapterScenePackage } from "../types";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { buildReadableAssetPoolAssetNames } from "./assemblyDisplayNames";
import {
  buildLayerDropTargets,
  buildLayerTreeData,
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
  type AssemblyLayerDropTarget,
  type AssemblyLayerTreeNode,
} from "./assemblyLayerTreeModel";

type AssemblyLayerTreeProps = {
  draft: AssemblyManifestDraft;
  hiddenPlacementIds?: ReadonlySet<string>;
  scenePackage: ChapterScenePackage;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
  onDraftChange: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds: (nodeIds: string[]) => void;
  onSelectPlacement: (placementId: string | null) => void;
  onTogglePlacementVisibility?: (node: AssemblyLayerTreeNode) => void;
};

type PlacementSelectionEvent = {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

type AssemblyLayerTreeMove = {
  dragIds: string[];
  index: number;
  parentId: unknown;
};

const EMPTY_HIDDEN_PLACEMENT_IDS: ReadonlySet<string> = new Set();

const layerDropCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

export function AssemblyLayerTree({
  draft,
  hiddenPlacementIds = EMPTY_HIDDEN_PLACEMENT_IDS,
  onDraftChange,
  onSelectNodeIds,
  onSelectPlacement,
  onTogglePlacementVisibility,
  scenePackage,
  selectedNodeIds,
  selectedPlacementId,
}: AssemblyLayerTreeProps) {
  const state = useAssemblyLayerTreeState(draft, scenePackage, selectedNodeIds, selectedPlacementId);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const draggingLayerNode = draggingLayerId ? state.nodesById.get(draggingLayerId) ?? null : null;
  const handlers = createAssemblyLayerTreeHandlers({
    draft,
    onDraftChange,
    onSelectNodeIds,
    onSelectPlacement,
    selectedNodeIds,
    selectedPlacementId,
    state,
  });

  function handleLayerDragStart(event: DragStartEvent) {
    setDraggingLayerId(String(event.active.id));
    setActiveDropTargetId(null);
  }

  function handleLayerDragOver(event: DragOverEvent) {
    setActiveDropTargetId(event.over?.id ? String(event.over.id) : null);
  }

  function handleLayerDragCancel() {
    setDraggingLayerId(null);
    setActiveDropTargetId(null);
  }

  function handleLayerDragEnd(event: DragEndEvent) {
    const draggedId = String(event.active.id);
    const dropTarget = event.over?.data.current?.target as AssemblyLayerDropTarget | undefined;
    setDraggingLayerId(null);
    setActiveDropTargetId(null);
    if (!dropTarget) {
      return;
    }
    handlers.handleLayerTreeMove({
      dragIds: [draggedId],
      parentId: dropTarget.parentId,
      index: dropTarget.index,
    });
  }

  return (
    <section className="chapter-studio-panel chapter-studio-panel-stack asset-tree-panel assembly-placement-list-panel" aria-label="Placement layers">
      <div className="chapter-studio-panel-heading assembly-layer-panel-heading">
        <div>
          <h2>Placement layers</h2>
          <p>Front to back</p>
        </div>
        <LayerPanelActions
          deleteNode={state.selectedLayerNode}
          groupAction={state.groupAction}
          onDelete={handlers.handleDeleteLayerNode}
          onGroupAction={handlers.handleGroupAction}
        />
      </div>
      <div className="asset-tree-body assembly-layer-tree-body" ref={state.panelBodyRef}>
        <div className="asset-tree assembly-layer-list" role="tree" aria-label="Placement layer order">
          {state.tree.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={layerDropCollisionDetection}
              onDragStart={handleLayerDragStart}
              onDragOver={handleLayerDragOver}
              onDragCancel={handleLayerDragCancel}
              onDragEnd={handleLayerDragEnd}
            >
              <div className="assembly-layer-native-tree" data-dragging-layer={draggingLayerId ?? undefined}>
                {state.visibleTree.map((node, index) => (
                  <PlacementLayerRootBlock
                    key={node.id}
                    activeDropTargetId={activeDropTargetId}
                    collapsedGroupIds={state.collapsedGroupIds}
                    draggingLayerId={draggingLayerId}
                    dropTargetsById={state.dropTargetsById}
                    hiddenPlacementIds={hiddenPlacementIds}
                    node={node}
                    onSelect={handlers.handleRowSelection}
                    onToggleGroup={handlers.handleToggleGroup}
                    onToggleVisibility={onTogglePlacementVisibility}
                    onUngroup={handlers.handleGroupAction}
                    rootIndex={index}
                    scenePackage={scenePackage}
                    selectedIdSet={state.selectedIdSet}
                    selectedNodeIds={selectedNodeIds}
                    selectedPlacementId={selectedPlacementId}
                  />
                ))}
                <LayerDropZone
                  active={draggingLayerId !== null}
                  activeDropTargetId={activeDropTargetId}
                  target={state.dropTargetsById.get("root-end")}
                />
              </div>
              <DragOverlay dropAnimation={null} zIndex={10_000}>
                {draggingLayerNode ? (
                  <LayerDragOverlayPreview node={draggingLayerNode} scenePackage={scenePackage} />
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : <PlacementLayerEmptyState />}
        </div>
      </div>
    </section>
  );
}

function useAssemblyLayerTreeState(
  draft: AssemblyManifestDraft,
  scenePackage: ChapterScenePackage,
  selectedNodeIds: string[],
  selectedPlacementId: string | null,
) {
  const assetNameById = useMemo(
    () => buildReadableAssetPoolAssetNames(scenePackage.chapter_assets),
    [scenePackage.chapter_assets],
  );
  const tree = useMemo(() => buildLayerTreeData(draft, assetNameById), [assetNameById, draft]);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const selectedIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const visibleTree = useMemo(() => applyCollapsedGroups(tree, collapsedGroupIds), [collapsedGroupIds, tree]);
  const dropTargets = useMemo(() => buildLayerDropTargets(visibleTree), [visibleTree]);
  const dropTargetsById = useMemo(
    () => new Map(dropTargets.map((target) => [target.id, target])),
    [dropTargets],
  );
  const visibleNodeIds = useMemo(() => flattenVisibleNodeIds(visibleTree), [visibleTree]);
  const nodesById = useMemo(() => indexLayerNodes(tree), [tree]);
  const selectedLayerNode = useMemo(() => {
    if (selectedNodeIds.length === 1) {
      return nodesById.get(selectedNodeIds[0] ?? "") ?? null;
    }
    // WHY: 多选时不能把最后聚焦的 placement 伪装成唯一删除目标；
    // 批量删除走 Properties 的确认入口，避免 header 图标误导删除范围。
    return null;
  }, [nodesById, selectedNodeIds]);
  const groupAction = useMemo(() => resolveGroupActionState(draft, selectedNodeIds), [draft, selectedNodeIds]);

  useEffect(() => {
    const scrollTargetId = selectedNodeIds[selectedNodeIds.length - 1] ?? selectedPlacementId;
    if (!scrollTargetId) {
      return;
    }
    const scrollTarget = panelBodyRef.current
      ?.querySelector<HTMLElement>(`[data-layer-node-id="${escapeLayerNodeId(scrollTargetId)}"]`) ?? null;
    if (typeof scrollTarget?.scrollIntoView === "function") {
      scrollTarget.scrollIntoView({ block: "nearest" });
    }
  }, [selectedNodeIds, selectedPlacementId, tree]);
  useEffect(() => pruneCollapsedGroupIds(draft, setCollapsedGroupIds), [draft.groups]);

  return {
    collapsedGroupIds,
    dropTargetsById,
    groupAction,
    nodesById,
    panelBodyRef,
    selectedLayerNode,
    selectedIdSet,
    setCollapsedGroupIds,
    tree,
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
    handleLayerTreeMove: (move: AssemblyLayerTreeMove) => {
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

function escapeLayerNodeId(nodeId: string): string {
  return nodeId.replace(/["\\]/g, "\\$&");
}

function LayerPanelActions({
  deleteNode,
  groupAction,
  onDelete,
  onGroupAction,
}: {
  deleteNode: AssemblyLayerTreeNode | null;
  groupAction: ReturnType<typeof resolveGroupActionState>;
  onDelete: (node: AssemblyLayerTreeNode) => void;
  onGroupAction: () => void;
}) {
  if (groupAction.kind === "idle" && !deleteNode) {
    return null;
  }

  return (
    <div className="assembly-layer-panel-actions" role="toolbar" aria-label="Layer actions">
      {groupAction.kind === "group" ? (
        <button
          type="button"
          className="course-planner-secondary-action assembly-layer-command"
          aria-label="Group selected layers"
          title="Group selected layers"
          onClick={onGroupAction}
        >
          <Layers3 size={15} aria-hidden="true" />
          <span>Group</span>
        </button>
      ) : null}
      {deleteNode ? (
        <LayerDeleteAction
          buttonClassName="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button assembly-layer-panel-delete-button"
          node={deleteNode}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}

function PlacementLayerRootBlock({
  activeDropTargetId,
  collapsedGroupIds,
  draggingLayerId,
  dropTargetsById,
  hiddenPlacementIds,
  node,
  onSelect,
  onToggleGroup,
  onToggleVisibility,
  onUngroup,
  rootIndex,
  scenePackage,
  selectedIdSet,
  selectedNodeIds,
  selectedPlacementId,
}: {
  activeDropTargetId: string | null;
  collapsedGroupIds: Set<string>;
  draggingLayerId: string | null;
  dropTargetsById: Map<string, AssemblyLayerDropTarget>;
  hiddenPlacementIds: ReadonlySet<string>;
  node: AssemblyLayerTreeNode;
  onSelect: (node: AssemblyLayerTreeNode, event: PlacementSelectionEvent) => void;
  onToggleGroup: (groupId: string) => void;
  onToggleVisibility?: (node: AssemblyLayerTreeNode) => void;
  onUngroup: () => void;
  rootIndex: number;
  scenePackage: ChapterScenePackage;
  selectedIdSet: Set<string>;
  selectedNodeIds: string[];
  selectedPlacementId: string | null;
}) {
  const isCollapsed = node.kind === "group" && collapsedGroupIds.has(node.id);
  const children = isCollapsed ? [] : node.children ?? [];

  return (
    <div className="assembly-layer-root-block" data-layer-root-index={rootIndex}>
      <LayerDropZone
        active={draggingLayerId !== null}
        activeDropTargetId={activeDropTargetId}
        target={dropTargetsById.get(`root-before-${node.id}`)}
      />
      <PlacementLayerListRow
        dragging={draggingLayerId === node.id}
        level={0}
        node={node}
        collapsed={isCollapsed}
        onSelect={onSelect}
        onUngroup={onUngroup}
        onToggleGroup={onToggleGroup}
        onToggleVisibility={onToggleVisibility}
        scenePackage={scenePackage}
        selected={isLayerNodeSelected(node, selectedIdSet, selectedNodeIds, selectedPlacementId)}
        visibilityHidden={isLayerNodeHidden(node, hiddenPlacementIds)}
      />
      {node.kind === "group" && children.length > 0 ? (
        <div className="assembly-layer-group-children" role="group" aria-label={`${node.name} child layers`}>
          {children.map((child) => (
            <div key={child.id} className="assembly-layer-child-block">
              <LayerDropZone
                active={draggingLayerId !== null}
                activeDropTargetId={activeDropTargetId}
                target={dropTargetsById.get(`group-${node.id}-before-${child.id}`)}
              />
              <PlacementLayerListRow
                dragging={draggingLayerId === child.id}
                level={1}
                node={child}
                collapsed={false}
                onSelect={onSelect}
                onUngroup={onUngroup}
                onToggleGroup={onToggleGroup}
                onToggleVisibility={onToggleVisibility}
                scenePackage={scenePackage}
                selected={isLayerNodeSelected(child, selectedIdSet, selectedNodeIds, selectedPlacementId)}
                visibilityHidden={isLayerNodeHidden(child, hiddenPlacementIds)}
              />
            </div>
          ))}
          <LayerDropZone
            active={draggingLayerId !== null}
            activeDropTargetId={activeDropTargetId}
            target={dropTargetsById.get(`group-${node.id}-end`)}
          />
        </div>
      ) : null}
    </div>
  );
}

function PlacementLayerListRow({
  collapsed,
  dragging,
  level,
  node,
  onSelect,
  onUngroup,
  onToggleGroup,
  onToggleVisibility,
  scenePackage,
  selected,
  visibilityHidden,
}: {
  collapsed: boolean;
  dragging: boolean;
  level: number;
  node: AssemblyLayerTreeNode;
  onSelect: (node: AssemblyLayerTreeNode, event: PlacementSelectionEvent) => void;
  onUngroup: () => void;
  onToggleGroup: (groupId: string) => void;
  onToggleVisibility?: (node: AssemblyLayerTreeNode) => void;
  scenePackage: ChapterScenePackage;
  selected: boolean;
  visibilityHidden: boolean;
}) {
  const row = node;
  const rowAriaLabel = `${row.name} ${row.kind === "placement" ? row.runtimeRole : row.typeLabel ?? ""}`.trim();
  const rowRoleLabel = row.kind === "group" ? `(${flattenNodePlacementIds(row).length})` : row.typeLabel;
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: row.id,
    data: {
      kind: row.kind,
      nodeId: row.id,
    },
  });

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
      className={[
        "asset-tree-item",
        "assembly-layer-item",
        row.kind === "group" ? "assembly-layer-item-group" : "assembly-layer-item-placement",
        selected ? "is-selected is-focused" : "",
        visibilityHidden ? "is-hidden" : "",
        dragging || isDragging ? "is-dragging" : "",
      ].filter(Boolean).join(" ")}
      data-depth={level}
      data-layer-node-id={row.id}
      role="treeitem"
      aria-selected={selected}
    >
      <div
        ref={setNodeRef}
        className="asset-tree-row assembly-layer-row"
      >
        <div
          className="asset-tree-row-depth"
          style={{
            "--asset-depth": level,
            "--assembly-layer-depth-offset": level > 0 ? "24px" : "0",
          } as CSSProperties}
        >
          {row.kind === "group" ? (
            <LayerCollapseToggle collapsed={collapsed} groupName={row.name} onClick={handleToggleClick} />
          ) : (
            <span className="asset-generate-toggle-spacer" aria-hidden="true" />
          )}
          <div
            {...attributes}
            {...listeners}
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
                <Folder size={16} />
              </span>
            )}
            <strong className="assembly-layer-name">{row.name}</strong>
          </div>
        </div>
        <span
          className="asset-tree-actions assembly-layer-row-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {rowRoleLabel ? <span className="assembly-layer-role">{rowRoleLabel}</span> : null}
          {selected && row.kind === "group" ? (
            <LayerUngroupAction node={row} onUngroup={onUngroup} />
          ) : null}
          <LayerVisibilityAction hidden={visibilityHidden} node={row} onToggle={onToggleVisibility} />
        </span>
      </div>
    </div>
  );
}

function LayerDragOverlayPreview({
  node,
  scenePackage,
}: {
  node: AssemblyLayerTreeNode;
  scenePackage: ChapterScenePackage;
}) {
  const roleLabel = node.kind === "group" ? `(${flattenNodePlacementIds(node).length})` : node.typeLabel;
  return (
    <div
      className={[
        "asset-tree-item",
        "assembly-layer-item",
        "assembly-layer-drag-overlay",
        node.kind === "group" ? "assembly-layer-item-group" : "assembly-layer-item-placement",
      ].join(" ")}
    >
      <div className="asset-tree-row assembly-layer-row">
        <div
          className="asset-tree-row-depth"
          style={{
            "--asset-depth": 0,
            "--assembly-layer-depth-offset": "0",
          } as CSSProperties}
        >
          <span className="asset-generate-toggle-spacer" aria-hidden="true" />
          <div className="asset-tree-select assembly-layer-row-select">
            {node.assetId ? (
              <img
                className="asset-tree-thumb assembly-layer-thumb"
                alt=""
                src={scenePackageMediaUrl(scenePackage.chapter_id, "chapter_assets", node.assetId)}
              />
            ) : (
              <span className="asset-tree-thumb assembly-layer-thumb assembly-layer-thumb-group" aria-hidden="true">
                <Folder size={16} />
              </span>
            )}
            <strong className="assembly-layer-name">{node.name}</strong>
          </div>
        </div>
        <span className="asset-tree-actions assembly-layer-row-actions">
          {roleLabel ? <span className="assembly-layer-role">{roleLabel}</span> : null}
        </span>
      </div>
    </div>
  );
}

function LayerDropZone({
  active,
  activeDropTargetId,
  target,
}: {
  active: boolean;
  activeDropTargetId: string | null;
  target: AssemblyLayerDropTarget | undefined;
}) {
  if (!target) {
    return null;
  }
  return <RegisteredLayerDropZone active={active} activeDropTargetId={activeDropTargetId} target={target} />;
}

function RegisteredLayerDropZone({
  active,
  activeDropTargetId,
  target,
}: {
  active: boolean;
  activeDropTargetId: string | null;
  target: AssemblyLayerDropTarget;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: target.id,
    data: { target },
  });
  const isCurrentTarget = isOver || activeDropTargetId === target.id;

  return (
    <div
      ref={setNodeRef}
      aria-label={target.label}
      className={[
        "assembly-layer-drop-zone",
        `assembly-layer-drop-zone-${target.kind}`,
        active ? "is-drop-active" : "",
        isCurrentTarget ? "is-over" : "",
      ].filter(Boolean).join(" ")}
      data-layer-drop-kind={target.kind}
      data-layer-drop-parent-id={target.parentId ?? "root"}
      data-layer-drop-index={target.index}
    />
  );
}

function LayerUngroupAction({
  node,
  onUngroup,
}: {
  node: AssemblyLayerTreeNode;
  onUngroup: () => void;
}) {
  const label = `Ungroup ${node.name}`;
  return (
    <button
      type="button"
      className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button assembly-layer-ungroup-button"
      aria-label={label}
      title={label}
      onClick={onUngroup}
    >
      <Layers3 size={15} aria-hidden="true" />
    </button>
  );
}

function isLayerNodeHidden(node: AssemblyLayerTreeNode, hiddenPlacementIds: ReadonlySet<string>): boolean {
  const placementIds = flattenNodePlacementIds(node);
  return placementIds.length > 0 && placementIds.every((placementId) => hiddenPlacementIds.has(placementId));
}

function LayerVisibilityAction({
  hidden,
  node,
  onToggle,
}: {
  hidden: boolean;
  node: AssemblyLayerTreeNode;
  onToggle?: (node: AssemblyLayerTreeNode) => void;
}) {
  const action = hidden ? "Show" : "Hide";
  const label = `${action} ${node.name}${node.kind === "group" ? " group" : ""}`;
  return (
    <button
      type="button"
      className="course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button assembly-layer-visibility-button"
      aria-label={label}
      title={label}
      onClick={() => onToggle?.(node)}
    >
      {hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
    </button>
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
  buttonClassName = "course-planner-secondary-action chapter-studio-icon-action assembly-editor-icon-button assembly-layer-delete-button",
  node,
  onDelete,
}: {
  buttonClassName?: string;
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
          className={buttonClassName}
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
