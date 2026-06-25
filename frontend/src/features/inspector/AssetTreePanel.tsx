import { CSSProperties, KeyboardEvent, MouseEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Tree,
  type NodeRendererProps,
  type TreeApi,
} from "react-arborist";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import {
  ElementSelectionMode,
  ElementSelectionOptions,
  SelectedElementIds,
  thumbnailUrl,
  WorkflowStage,
  WorkspaceElement,
} from "../../domain/workspace";
import { isGenerateSelectableElement } from "../../domain/workspaceDerived";
import {
  taskItemStatusLabel,
  taskStatusTone,
  type WorkspaceTaskItemIndex,
} from "../../domain/workspaceTasks";
import {
  buildAssetTree,
  collectExpandableIds,
  formatAssetBadgeLabel,
  formatConfidence,
  formatOriginLabel,
  isAssetTreeDropDisabled,
  isActiveCandidate,
  resolveAssetTreeMoveAction,
  statusTagTone,
  type AssetTreeNode,
  type AssetTreeReorderPosition,
} from "./assetTreeModel";
import { AssetTag } from "../../shared/ui/AssetTag";
import { ConfirmActionDialog } from "../../shared/ui/ConfirmActionDialog";

export type { AssetTreeReorderPosition } from "./assetTreeModel";

type AssetTreePanelProps = {
  elements: WorkspaceElement[];
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  workspaceRunId: string | null;
  assetCacheKey: number;
  showRejected: boolean;
  hasRejectedElements: boolean;
  reviewableCount: number;
  taskItemsByElementId?: WorkspaceTaskItemIndex;
  workflowStage?: WorkflowStage;
  generateSelection?: Record<string, boolean>;
  onSelectElement: (
    elementId: string,
    mode?: ElementSelectionMode,
    options?: ElementSelectionOptions,
  ) => void;
  onToggleShowRejected: () => void;
  onToggleVisibility: (elementId: string) => void;
  onCompleteReview: () => void;
  onMoveElementToParent: (elementId: string, parentId: string | null) => void;
  onRejectElement?: (elementId: string) => void;
  onReorderElement: (
    elementId: string,
    targetElementId: string,
    position: AssetTreeReorderPosition,
  ) => void;
  onToggleAllGenerateSelection?: (elementIds: string[], isSelected: boolean) => void;
  onToggleGenerateSelection?: (elementId: string, isSelected: boolean) => void;
};

const ASSET_TREE_ROW_HEIGHT = 78;
const REACT_ARBORIST_ROOT_ID = "__REACT_ARBORIST_INTERNAL_ROOT__";

export const AssetTreePanel = memo(AssetTreePanelContent, areAssetTreePanelPropsEqual);

function AssetTreePanelContent({
  elements,
  selectedElementId,
  selectedElementIds,
  workspaceRunId,
  assetCacheKey,
  showRejected,
  hasRejectedElements,
  taskItemsByElementId = {},
  workflowStage,
  generateSelection = {},
  onSelectElement,
  onToggleShowRejected,
  onToggleVisibility,
  onMoveElementToParent,
  onRejectElement,
  onReorderElement,
  onToggleAllGenerateSelection,
  onToggleGenerateSelection,
}: AssetTreePanelProps) {
  const stableElements = useStableAssetTreeElements(elements);
  const displayElements = useMemo(
    () => stableElements.filter((element) => element.mergedInto === null),
    [stableElements],
  );
  const rawTree = useMemo(() => buildAssetTree(displayElements), [displayElements]);
  const tree = useStableAssetTree(rawTree);
  const treeRef = useRef<TreeApi<AssetTreeNode>>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const initialOpenState = useMemo(
    () => Object.fromEntries(collectExpandableIds(tree).map((id) => [id, true])),
    [tree],
  );
  const visibleRowCount = useMemo(() => countVisibleAssetTreeRows(tree), [tree]);
  const treeFallbackHeight = Math.max(ASSET_TREE_ROW_HEIGHT, visibleRowCount * ASSET_TREE_ROW_HEIGHT);
  const [treeViewportHeight, setTreeViewportHeight] = useState(treeFallbackHeight);
  const generateSelectableIds = useMemo(
    () => displayElements
      .filter(isGenerateSelectableElement)
      .map((element) => element.id),
    [displayElements],
  );
  const showsGenerateBulkSelection =
    (workflowStage === "mask" || workflowStage === "generate")
    && generateSelectableIds.length > 0
    && Boolean(onToggleAllGenerateSelection);
  const hasTreeToolbar = showsGenerateBulkSelection || hasRejectedElements;
  const selectedGenerateCount = generateSelectableIds.filter((elementId) => generateSelection[elementId] ?? true).length;

  useEffect(() => {
    if (!selectedElementId) {
      return;
    }
    // WHY: react-arborist 现在是资产树唯一纵向滚动容器；选中同步只触达
    // TreeApi，避免外层 panel-scroll 和内部虚拟列表互相制造双滚动条。
    treeRef.current?.scrollTo(selectedElementId);
  }, [selectedElementId, tree]);

  useEffect(() => {
    const body = panelBodyRef.current;
    if (!body) {
      setTreeViewportHeight(treeFallbackHeight);
      return;
    }

    function syncTreeHeight() {
      const measuredHeight = body?.clientHeight ?? 0;
      setTreeViewportHeight(
        measuredHeight > 0
          ? Math.max(ASSET_TREE_ROW_HEIGHT, measuredHeight)
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
  }, [treeFallbackHeight]);

  useEffect(() => {
    // WHY: Arborist 的 initialOpenState 只在首次挂载读取；检测、split 或拖拽后新增
    // child 时需要重新打开有子项的父节点，否则用户完成父子关系却看不到刚放进去的子项。
    collectExpandableIds(tree).forEach((elementId) => treeRef.current?.open(elementId));
  }, [tree]);

  function handleTreeMove({
    dragIds,
    parentId,
    index,
  }: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) {
    const sourceId = dragIds[0];
    if (!sourceId) {
      return;
    }
    const normalizedParentId = parentId === REACT_ARBORIST_ROOT_ID ? null : parentId;
    const action = resolveAssetTreeMoveAction(displayElements, sourceId, normalizedParentId, index);
    if (!action) {
      return;
    }
    if (action.kind === "parent") {
      onMoveElementToParent(sourceId, action.parentId);
      return;
    }
    onReorderElement(sourceId, action.targetElementId, action.position);
  }

  return (
    <aside
      className={[
        "panel",
        "asset-tree-panel",
        hasRejectedElements ? "has-rejected-filter" : "",
        hasTreeToolbar ? "has-tree-toolbar" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="panel-header">
        <h2>
          Assets ({displayElements.length})
          <span className="visually-hidden"> Elements</span>
        </h2>
        <span className="panel-header-kicker">Sticker outputs</span>
      </div>
      {hasTreeToolbar ? (
        <div className="panel-toolbar asset-tree-toolbar">
          {showsGenerateBulkSelection ? (
            <GenerateSelectionBulkToggle
              elementIds={generateSelectableIds}
              selectedCount={selectedGenerateCount}
              onToggleAllGenerateSelection={onToggleAllGenerateSelection!}
            />
          ) : null}
          {hasRejectedElements ? (
          <label className="panel-checkbox">
            <input
              aria-label="Show rejected"
              type="checkbox"
              checked={showRejected}
              onChange={onToggleShowRejected}
            />
            <span>Show rejected</span>
          </label>
          ) : null}
        </div>
      ) : null}
      <div className="panel-body asset-tree-body" ref={panelBodyRef}>
        {tree.length > 0 ? (
          <div role="tree" aria-label="Asset tree" className="asset-tree">
            <Tree
              ref={treeRef}
              className="asset-tree-arborist"
              data={tree}
              height={treeViewportHeight}
              indent={0}
              initialOpenState={initialOpenState}
              overscanCount={4}
              rowHeight={ASSET_TREE_ROW_HEIGHT}
              selection={selectedElementId ?? undefined}
              width="100%"
              childrenAccessor={(node) => node.children}
              disableDrag={(node) => !isActiveCandidate(node.element)}
              disableDrop={({ dragNodes, parentNode }) => {
                return isAssetTreeDropDisabled(
                  dragNodes[0]?.data?.element,
                  parentNode?.data?.element,
                );
              }}
              idAccessor={(node) => node.element.id}
              onMove={handleTreeMove}
              openByDefault={false}
            >
              {(props) => (
                <AssetTreeItem
                  {...props}
                  assetCacheKey={assetCacheKey}
                  generateSelection={generateSelection}
                  onRejectElement={onRejectElement}
                  onSelectElement={onSelectElement}
                  onToggleGenerateSelection={onToggleGenerateSelection}
                  onToggleVisibility={onToggleVisibility}
                  selectedElementId={selectedElementId}
                  selectedElementIds={selectedElementIds}
                  taskItemsByElementId={taskItemsByElementId}
                  workflowStage={workflowStage}
                  workspaceRunId={workspaceRunId}
                />
              )}
            </Tree>
          </div>
        ) : (
          <p className="visually-hidden">No assets yet.</p>
        )}
      </div>
    </aside>
  );
}

function GenerateSelectionBulkToggle({
  elementIds,
  selectedCount,
  onToggleAllGenerateSelection,
}: {
  elementIds: string[];
  selectedCount: number;
  onToggleAllGenerateSelection: (elementIds: string[], isSelected: boolean) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const isAllSelected = selectedCount === elementIds.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < elementIds.length;
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  return (
    <label className="asset-tree-bulk-toggle">
      <input
        ref={checkboxRef}
        aria-label={`${isAllSelected ? "Clear" : "Select"} all assets for generation`}
        type="checkbox"
        checked={isAllSelected}
        onChange={() => onToggleAllGenerateSelection(elementIds, !isAllSelected)}
      />
      <span>{isAllSelected ? "Clear all" : "Select all"}</span>
      <small>{selectedCount}/{elementIds.length}</small>
    </label>
  );
}

function areAssetTreePanelPropsEqual(
  previous: AssetTreePanelProps,
  next: AssetTreePanelProps,
): boolean {
  // WHY: App 顶层 render 会重建回调与 task index；资产树只按可见展示输入重绘，
  // 避免 Segment mask 局部保存时 react-arborist 重挂载所有缩略图行。
  return (
    previous.workspaceRunId === next.workspaceRunId
    && previous.assetCacheKey === next.assetCacheKey
    && previous.showRejected === next.showRejected
    && previous.hasRejectedElements === next.hasRejectedElements
    && previous.reviewableCount === next.reviewableCount
    && previous.workflowStage === next.workflowStage
    && previous.selectedElementId === next.selectedElementId
    && sameStringList(previous.selectedElementIds, next.selectedElementIds)
    && sameElementSignatures(previous.elements, next.elements)
    && taskItemIndexSignature(previous.taskItemsByElementId ?? {}) === taskItemIndexSignature(next.taskItemsByElementId ?? {})
    && generateSelectionSignature(previous.generateSelection ?? {}) === generateSelectionSignature(next.generateSelection ?? {})
  );
}

function AssetTreeItem({
  assetCacheKey,
  node,
  dragHandle,
  style,
  onSelectElement,
  onRejectElement,
  onToggleVisibility,
  selectedElementId,
  selectedElementIds,
  taskItemsByElementId,
  workflowStage,
  generateSelection,
  workspaceRunId,
  onToggleGenerateSelection,
}: NodeRendererProps<AssetTreeNode> & {
  assetCacheKey: number;
  onRejectElement?: (elementId: string) => void;
  onSelectElement: AssetTreePanelProps["onSelectElement"];
  onToggleVisibility: (elementId: string) => void;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  taskItemsByElementId: WorkspaceTaskItemIndex;
  workflowStage?: WorkflowStage;
  generateSelection: Record<string, boolean>;
  workspaceRunId: string | null;
  onToggleGenerateSelection?: (elementId: string, isSelected: boolean) => void;
}) {
  const element = node.data.element;
  const isFocused = selectedElementId === element.id;
  const isSelected = selectedElementIds.includes(element.id);
  const canAct = isActiveCandidate(element);
  const labelId = `asset-tree-label-${element.id}`;
  const thumbUrl = thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId);
  const taskItem = taskItemsByElementId[element.id] ?? null;
  const showsGenerateSelection =
    (workflowStage === "mask" || workflowStage === "generate")
    && isGenerateSelectableElement(element)
    && onToggleGenerateSelection;
  const isSelectedForGenerate = generateSelection[element.id] ?? true;

  function handleSelect(event: MouseEvent<HTMLElement>) {
    onSelectElement(
      element.id,
      event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace",
      { focusCanvas: true },
    );
  }

  function handleSelectKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelectElement(
      element.id,
      event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace",
      { focusCanvas: true },
    );
  }

  return (
    <div
      style={style}
      className={[
        "asset-tree-item",
        isSelected ? "is-selected" : "",
        isFocused ? "is-focused" : "",
        node.isDragging ? "is-dragging" : "",
        node.willReceiveDrop ? "is-drop-target" : "",
        !canAct ? "is-display-only" : "",
      ].filter(Boolean).join(" ")}
    >
      <div
        ref={dragHandle}
        className="asset-tree-row"
      >
        <div
          className="asset-tree-row-depth"
          style={{ "--asset-depth": node.level } as CSSProperties}
        >
          {showsGenerateSelection ? (
            <label
              className="asset-generate-toggle"
              title={isSelectedForGenerate ? "Selected for Codex generation" : "Skipped for Codex generation"}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                aria-label={`${isSelectedForGenerate ? "Skip" : "Select"} ${element.name} for generation`}
                type="checkbox"
                checked={isSelectedForGenerate}
                onChange={(event) => onToggleGenerateSelection(element.id, event.currentTarget.checked)}
              />
            </label>
          ) : (
            <span className="asset-generate-toggle-spacer" aria-hidden="true" />
          )}
          <div
            className="asset-tree-select"
            role="button"
            tabIndex={0}
            aria-label={`Select ${element.name}`}
            aria-pressed={isSelected}
            onClick={handleSelect}
            onKeyDown={handleSelectKeyDown}
          >
            {thumbUrl ? (
              <img
                alt={`${element.name} thumbnail`}
                className="asset-tree-thumb"
                src={thumbUrl}
              />
            ) : (
              <span className="asset-tree-thumb asset-tree-thumb-empty">No thumb</span>
            )}
            <span className="asset-tree-copy">
              <strong id={labelId}>{element.name}</strong>
              <span>{formatConfidence(element.confidence)} · {formatOriginLabel(element)}</span>
            </span>
            <span className="asset-tree-badges" aria-label={`${element.name} metadata`}>
              <AssetTag tone={statusTagTone(element.status)}>{formatAssetBadgeLabel(element)}</AssetTag>
              {taskItem ? (
                <AssetTag tone={taskStatusTone(taskItem.status)} title={taskItem.message}>
                  {taskItemStatusLabel(taskItem.status)}
                </AssetTag>
              ) : null}
            </span>
          </div>
        </div>
        <span className="asset-tree-actions">
          {canAct ? (
            <button
              type="button"
              className={`asset-visibility-toggle${element.visible ? " is-visible" : ""}`}
              aria-label={`${element.visible ? "Hide" : "Show"} ${element.name}`}
              aria-pressed={element.visible}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onToggleVisibility(element.id)}
            >
              {element.visible ? <Eye size={16} strokeWidth={2.3} /> : <EyeOff size={16} strokeWidth={2.3} />}
            </button>
          ) : (
            <span className="asset-tree-action-spacer" aria-hidden="true" />
          )}
          {canAct && onRejectElement ? (
            <ConfirmActionDialog
              title="Remove from active assets"
              description="Remove this asset from active assets. It is rejected and hidden, not physically deleted; turn on Show rejected to bring it back."
              confirmLabel="Remove asset"
              onConfirm={() => onRejectElement(element.id)}
              trigger={(
                <button
                  type="button"
                  className="asset-delete-button"
                  aria-label={`Delete ${element.name}`}
                  title="Remove from active assets"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Trash2 size={15} strokeWidth={2.3} aria-hidden="true" />
                </button>
              )}
            />
          ) : (
            <span className="asset-tree-action-spacer" aria-hidden="true" />
          )}
        </span>
      </div>
    </div>
  );
}

function countVisibleAssetTreeRows(nodes: AssetTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countVisibleAssetTreeRows(node.children), 0);
}

function useStableAssetTreeElements(elements: WorkspaceElement[]): WorkspaceElement[] {
  const previousRef = useRef<{ elements: WorkspaceElement[]; signatures: string[] } | null>(null);
  const signatures = useMemo(() => elements.map(assetTreeElementSignature), [elements]);
  const previous = previousRef.current;
  const canReusePrevious =
    previous
    && previous.signatures.length === signatures.length
    && signatures.every((signature, index) => signature === previous.signatures[index]);
  if (canReusePrevious) {
    return previous.elements;
  }
  previousRef.current = { elements, signatures };
  return elements;
}

function useStableAssetTree(rawTree: AssetTreeNode[]): AssetTreeNode[] {
  const previousTreeRef = useRef<AssetTreeNode[]>([]);
  return useMemo(() => {
    // WHY: mask 草稿保存会更新 workspace state，但未变资产的缩略图 DOM 不能被
    // react-arborist 连带重建；复用稳定 node 可以阻断同 URL 缩略图的重复网络请求。
    const stableTree = reuseStableAssetTreeNodes(rawTree, previousTreeRef.current);
    previousTreeRef.current = stableTree;
    return stableTree;
  }, [rawTree]);
}

function reuseStableAssetTreeNodes(
  nextNodes: AssetTreeNode[],
  previousNodes: AssetTreeNode[],
): AssetTreeNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.element.id, node]));
  let changed = nextNodes.length !== previousNodes.length;
  const stableNodes = nextNodes.map((nextNode, index) => {
    const previousNode = previousById.get(nextNode.element.id);
    const stableChildren = reuseStableAssetTreeNodes(
      nextNode.children,
      previousNode?.children ?? [],
    );
    const canReusePrevious =
      previousNode
      && previousNode.element === nextNode.element
      && stableChildren === previousNode.children;
    if (canReusePrevious) {
      changed ||= previousNodes[index] !== previousNode;
      return previousNode;
    }
    changed = true;
    return stableChildren === nextNode.children
      ? nextNode
      : { ...nextNode, children: stableChildren };
  });

  return changed ? stableNodes : previousNodes;
}

function assetTreeElementSignature(element: WorkspaceElement): string {
  return [
    element.id,
    element.parentId ?? "",
    element.mergedInto ?? "",
    element.name,
    element.thumbnail ?? "",
    String(element.visible),
    element.mode,
    element.status,
    element.exportStatus,
    element.source,
    element.sourceProvider ?? "",
    element.confidence ?? "",
    formatAssetBadgeLabel(element),
  ].join("\u001f");
}

function sameElementSignatures(
  previous: WorkspaceElement[],
  next: WorkspaceElement[],
): boolean {
  return (
    previous.length === next.length
    && previous.every((element, index) =>
      assetTreeElementSignature(element) === assetTreeElementSignature(next[index]),
    )
  );
}

function sameStringList(previous: string[], next: string[]): boolean {
  return (
    previous.length === next.length
    && previous.every((value, index) => value === next[index])
  );
}

function taskItemIndexSignature(taskItemsByElementId: WorkspaceTaskItemIndex): string {
  return Object.values(taskItemsByElementId)
    .map((item) => [
      item.elementId,
      item.status,
      item.message,
      item.startedAt ?? "",
      item.finishedAt ?? "",
    ].join("\u001e"))
    .sort()
    .join("\u001f");
}

function generateSelectionSignature(generateSelection: Record<string, boolean>): string {
  return Object.entries(generateSelection)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([elementId, isSelected]) => `${elementId}:${isSelected ? "1" : "0"}`)
    .join("\u001f");
}
