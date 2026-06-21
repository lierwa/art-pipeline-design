import { CSSProperties, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff } from "lucide-react";

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
  type WorkspaceTaskItem,
  type WorkspaceTaskItemIndex,
} from "../../domain/workspaceTasks";
import {
  buildAssetTree,
  collectExpandableIds,
  flattenVisibleAssetTreeIds,
  formatAssetBadgeLabel,
  formatConfidence,
  formatOriginLabel,
  getAssetTreeDropIntentFromOffset,
  isActiveCandidate,
  resolveAssetTreeDropAction,
  statusToneClass,
  type AssetTreeDropAction,
  type AssetTreeDropIntent,
  type AssetTreeDropPreview,
  type AssetTreeNode,
  type AssetTreeReorderPosition,
} from "./assetTreeModel";

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
  onReorderElement: (
    elementId: string,
    targetElementId: string,
    position: AssetTreeReorderPosition,
  ) => void;
  onToggleGenerateSelection?: (elementId: string, isSelected: boolean) => void;
};

type DragRect = {
  height: number;
  top: number;
};

export function AssetTreePanel({
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
  onReorderElement,
  onToggleGenerateSelection,
}: AssetTreePanelProps) {
  const displayElements = useMemo(
    () => elements.filter((element) => element.mergedInto === null),
    [elements],
  );
  const tree = useMemo(() => buildAssetTree(displayElements), [displayElements]);
  const [expandedIds, setExpandedIds] = useState<string[]>(() => collectExpandableIds(tree));
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<AssetTreeDropPreview | null>(null);
  const pointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      collectExpandableIds(tree).forEach((elementId) => next.add(elementId));
      return Array.from(next);
    });
  }, [tree]);

  useEffect(() => {
    function handleWindowPointerMove(event: globalThis.PointerEvent) {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    }
    function handleWindowMouseMove(event: globalThis.MouseEvent) {
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
    }

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: true });
    window.addEventListener("mousemove", handleWindowMouseMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("mousemove", handleWindowMouseMove);
    };
  }, []);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const visibleItemIds = useMemo(
    () => flattenVisibleAssetTreeIds(tree, expandedSet),
    [expandedSet, tree],
  );

  useEffect(() => {
    if (!selectedElementId) {
      return;
    }
    rowRefs.current.get(selectedElementId)?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedElementId]);

  function toggleExpanded(elementId: string) {
    setExpandedIds((current) =>
      current.includes(elementId)
        ? current.filter((currentId) => currentId !== elementId)
        : [...current, elementId],
    );
  }

  function registerRow(elementId: string, node: HTMLDivElement | null) {
    if (node) {
      rowRefs.current.set(elementId, node);
      return;
    }
    rowRefs.current.delete(elementId);
  }

  function handleDragStart(event: DragStartEvent) {
    const sourceId = getElementId(event.active.id);
    setDraggedElementId(sourceId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    pointerPositionRef.current = { x: event.clientX, y: event.clientY };
  }

  function handleDragMove(event: DragMoveEvent) {
    updateDropPreview(event);
  }

  function handleDragOver(event: DragOverEvent) {
    updateDropPreview(event);
  }

  function handleDragEnd(event: DragEndEvent) {
    const sourceId = getElementId(event.active.id);
    const targetId = getElementId(event.over?.id);
    const dropAction = sourceId && targetId
      ? getDropAction(sourceId, targetId, getActiveDragRect(event))
      : null;

    setDraggedElementId(null);
    setDropPreview(null);
    if (!sourceId || !targetId || !dropAction) {
      return;
    }
    if (dropAction.kind === "reorder") {
      onReorderElement(sourceId, targetId, dropAction.position);
      return;
    }
    onMoveElementToParent(sourceId, targetId);
  }

  function handleDragCancel() {
    setDraggedElementId(null);
    setDropPreview(null);
  }

  function updateDropPreview(event: DragMoveEvent | DragOverEvent) {
    const sourceId = getElementId(event.active.id);
    const targetId = getElementId(event.over?.id);
    const dropAction = sourceId && targetId
      ? getDropAction(sourceId, targetId, getActiveDragRect(event))
      : null;
    setDropPreview(toDropPreview(targetId, dropAction));
  }

  function getDropAction(
    sourceId: string,
    targetId: string,
    activeRect: DragRect | null,
  ): AssetTreeDropAction | null {
    const intent = getDndDropIntent(targetId, activeRect);
    return resolveAssetTreeDropAction(displayElements, sourceId, targetId, intent);
  }

  function getDndDropIntent(targetElementId: string, activeRect: DragRect | null): AssetTreeDropIntent {
    const row = getTreeRowElement(rowRefs.current.get(targetElementId));
    const rowRect = row?.getBoundingClientRect();
    if (!rowRect || rowRect.height <= 0) {
      return "inside";
    }
    const pointerY = pointerPositionRef.current?.y;
    if (typeof pointerY === "number") {
      return getAssetTreeDropIntentFromOffset(pointerY - rowRect.top, rowRect.height);
    }
    if (!activeRect) {
      return "inside";
    }
    return getAssetTreeDropIntentFromOffset(activeRect.top + activeRect.height / 2 - rowRect.top, rowRect.height);
  }

  return (
    <aside
      className={`panel asset-tree-panel${hasRejectedElements ? " has-rejected-filter" : ""}`}
      onPointerMoveCapture={handlePointerMove}
    >
      <div className="panel-header">
        <h2>
          Assets ({displayElements.length})
          <span className="visually-hidden"> Elements</span>
        </h2>
        <span className="panel-header-kicker">Sticker outputs</span>
      </div>
      {hasRejectedElements ? (
        <div className="panel-toolbar">
          <label className="panel-checkbox">
            <input
              aria-label="Show rejected"
              type="checkbox"
              checked={showRejected}
              onChange={onToggleShowRejected}
            />
            <span>Show rejected</span>
          </label>
        </div>
      ) : null}
      <div className="panel-body panel-scroll">
        {tree.length > 0 ? (
          <DndContext
            collisionDetection={pointerWithin}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <SortableContext items={visibleItemIds} strategy={verticalListSortingStrategy}>
              <div role="tree" aria-label="Asset tree" className="asset-tree">
                {tree.map((node) => (
                  <AssetTreeItem
                    key={node.element.id}
                    assetCacheKey={assetCacheKey}
                    depth={0}
                    draggedElementId={draggedElementId}
                    dropPreview={dropPreview}
                    expandedSet={expandedSet}
                    node={node}
                    onRegisterRow={registerRow}
                    onSelectElement={onSelectElement}
                    onToggleExpanded={toggleExpanded}
                    onToggleVisibility={onToggleVisibility}
                    selectedElementId={selectedElementId}
                    selectedElementIds={selectedElementIds}
                    taskItem={taskItemsByElementId[node.element.id] ?? null}
                    taskItemsByElementId={taskItemsByElementId}
                    workflowStage={workflowStage}
                    generateSelection={generateSelection}
                    workspaceRunId={workspaceRunId}
                    onToggleGenerateSelection={onToggleGenerateSelection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="visually-hidden">No assets yet.</p>
        )}
      </div>
    </aside>
  );
}

function AssetTreeItem({
  assetCacheKey,
  depth,
  draggedElementId,
  dropPreview,
  expandedSet,
  node,
  onRegisterRow,
  onSelectElement,
  onToggleExpanded,
  onToggleVisibility,
  selectedElementId,
  selectedElementIds,
  taskItem,
  taskItemsByElementId,
  workflowStage,
  generateSelection,
  workspaceRunId,
  onToggleGenerateSelection,
}: {
  assetCacheKey: number;
  depth: number;
  draggedElementId: string | null;
  dropPreview: AssetTreeDropPreview | null;
  expandedSet: Set<string>;
  node: AssetTreeNode;
  onRegisterRow: (elementId: string, node: HTMLDivElement | null) => void;
  onSelectElement: AssetTreePanelProps["onSelectElement"];
  onToggleExpanded: (elementId: string) => void;
  onToggleVisibility: (elementId: string) => void;
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  taskItem: WorkspaceTaskItem | null;
  taskItemsByElementId: WorkspaceTaskItemIndex;
  workflowStage?: WorkflowStage;
  generateSelection: Record<string, boolean>;
  workspaceRunId: string | null;
  onToggleGenerateSelection?: (elementId: string, isSelected: boolean) => void;
}) {
  const element = node.element;
  const childCount = node.children.length;
  const isExpanded = expandedSet.has(element.id);
  const isFocused = selectedElementId === element.id;
  const isSelected = selectedElementIds.includes(element.id);
  const canAct = isActiveCandidate(element);
  const activeDropIntent = dropPreview?.targetId === element.id ? dropPreview.intent : null;
  const labelId = `asset-tree-label-${element.id}`;
  const thumbUrl = thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId);
  const showsGenerateSelection =
    (workflowStage === "mask" || workflowStage === "generate")
    && isGenerateSelectableElement(element)
    && onToggleGenerateSelection;
  const isSelectedForGenerate = generateSelection[element.id] ?? true;
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    disabled: !canAct,
    id: element.id,
  });

  function handleSelect(event: MouseEvent<HTMLButtonElement>) {
    onSelectElement(
      element.id,
      event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace",
      { focusCanvas: true },
    );
  }

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  } satisfies CSSProperties;
  const dragHandleProps = canAct ? { ...attributes, ...listeners } : {};

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-expanded={childCount > 0 ? isExpanded : undefined}
      aria-labelledby={labelId}
      ref={(row) => {
        setNodeRef(row);
        onRegisterRow(element.id, row);
      }}
      className={[
        "asset-tree-item",
        isSelected ? "is-selected" : "",
        isFocused ? "is-focused" : "",
        isDragging || draggedElementId === element.id ? "is-dragging" : "",
        activeDropIntent === "inside" ? "is-drop-target" : "",
        activeDropIntent === "before" ? "is-drop-before" : "",
        activeDropIntent === "after" ? "is-drop-after" : "",
        !canAct ? "is-display-only" : "",
      ].filter(Boolean).join(" ")}
      style={style}
    >
      <div
        className="asset-tree-row"
        style={{ "--asset-depth": depth } as CSSProperties}
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
        <button
          type="button"
          className="asset-disclosure"
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${element.name}`}
          disabled={childCount === 0}
          onClick={() => onToggleExpanded(element.id)}
        >
          {childCount > 0 ? (isExpanded ? "v" : ">") : ""}
        </button>
        <button
          type="button"
          className="asset-tree-select"
          aria-label={`Select ${element.name}`}
          aria-pressed={isSelected}
          onClick={handleSelect}
          {...dragHandleProps}
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
            <span className={`asset-badge ${statusToneClass(element.status)}`}>{formatAssetBadgeLabel(element)}</span>
            {taskItem ? (
              <span
                className={`asset-task-badge ${taskStatusTone(taskItem.status)}`}
                title={taskItem.message}
              >
                {taskItemStatusLabel(taskItem.status)}
              </span>
            ) : null}
          </span>
        </button>
        {canAct ? (
          <button
            type="button"
            className={`asset-visibility-toggle${element.visible ? " is-visible" : ""}`}
            aria-label={`${element.visible ? "Hide" : "Show"} ${element.name}`}
            aria-pressed={element.visible}
            onClick={() => onToggleVisibility(element.id)}
          >
            {element.visible ? <Eye size={16} strokeWidth={2.3} /> : <EyeOff size={16} strokeWidth={2.3} />}
          </button>
        ) : null}
      </div>
      {childCount > 0 && isExpanded ? (
        <div role="group" className="asset-tree-children">
          {node.children.map((child) => (
            <AssetTreeItem
              key={child.element.id}
              assetCacheKey={assetCacheKey}
              depth={depth + 1}
              draggedElementId={draggedElementId}
              dropPreview={dropPreview}
              expandedSet={expandedSet}
              node={child}
              onRegisterRow={onRegisterRow}
              onSelectElement={onSelectElement}
              onToggleExpanded={onToggleExpanded}
              onToggleVisibility={onToggleVisibility}
              selectedElementId={selectedElementId}
              selectedElementIds={selectedElementIds}
              taskItem={taskItemsByElementId[child.element.id] ?? null}
              taskItemsByElementId={taskItemsByElementId}
              workflowStage={workflowStage}
              generateSelection={generateSelection}
              workspaceRunId={workspaceRunId}
              onToggleGenerateSelection={onToggleGenerateSelection}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getTreeRowElement(item: HTMLDivElement | null | undefined): HTMLElement | null {
  if (!item) {
    return null;
  }
  const row = item.querySelector(".asset-tree-row");
  return row instanceof HTMLElement ? row : item;
}

function getActiveDragRect(event: DragMoveEvent | DragOverEvent | DragEndEvent): DragRect | null {
  return event.active.rect.current.translated ?? event.active.rect.current.initial ?? null;
}

function toDropPreview(
  targetId: string | null,
  dropAction: AssetTreeDropAction | null,
): AssetTreeDropPreview | null {
  if (!targetId || !dropAction) {
    return null;
  }
  return {
    targetId,
    intent: dropAction.kind === "reorder" ? dropAction.position : "inside",
  };
}

function getElementId(id: UniqueIdentifier | undefined): string | null {
  return typeof id === "string" ? id : null;
}
