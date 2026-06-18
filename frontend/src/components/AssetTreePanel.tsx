import { CSSProperties, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import {
  ElementSelectionMode,
  ElementSelectionOptions,
  SelectedElementIds,
  thumbnailUrl,
  WorkspaceElement,
} from "../workspace";

type AssetTreePanelProps = {
  elements: WorkspaceElement[];
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  workspaceRunId: string | null;
  assetCacheKey: number;
  showRejected: boolean;
  reviewableCount: number;
  onSelectElement: (
    elementId: string,
    mode?: ElementSelectionMode,
    options?: ElementSelectionOptions,
  ) => void;
  onToggleShowRejected: () => void;
  onToggleVisibility: (elementId: string) => void;
  onCompleteReview: () => void;
};

type AssetTreeNode = {
  element: WorkspaceElement;
  children: AssetTreeNode[];
};

export function AssetTreePanel({
  elements,
  selectedElementId,
  selectedElementIds,
  workspaceRunId,
  assetCacheKey,
  showRejected,
  reviewableCount,
  onSelectElement,
  onToggleShowRejected,
  onToggleVisibility,
  onCompleteReview,
}: AssetTreePanelProps) {
  const displayElements = useMemo(
    () => elements.filter((element) => element.mergedInto === null),
    [elements],
  );
  const tree = useMemo(() => buildAssetTree(displayElements), [displayElements]);
  const summary = useMemo(() => summarizeAssets(displayElements), [displayElements]);
  const [expandedIds, setExpandedIds] = useState<string[]>(() => collectExpandableIds(tree));
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      collectExpandableIds(tree).forEach((elementId) => next.add(elementId));
      return Array.from(next);
    });
  }, [tree]);

  const expandedSet = new Set(expandedIds);

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

  function renderNode(node: AssetTreeNode, depth: number) {
    const element = node.element;
    const childCount = node.children.length;
    const isExpanded = expandedSet.has(element.id);
    const isFocused = selectedElementId === element.id;
    const isSelected = selectedElementIds.includes(element.id);
    const canAct = isActiveCandidate(element);
    const labelId = `asset-tree-label-${element.id}`;
    const thumbUrl = thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId);

    function handleSelect(event: MouseEvent<HTMLButtonElement>) {
      onSelectElement(
        element.id,
        event.shiftKey || event.metaKey || event.ctrlKey ? "toggle" : "replace",
        { focusCanvas: true },
      );
    }

    return (
      <div
        key={element.id}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={childCount > 0 ? isExpanded : undefined}
        aria-labelledby={labelId}
        ref={(node) => {
          if (node) {
            rowRefs.current.set(element.id, node);
          } else {
            rowRefs.current.delete(element.id);
          }
        }}
        className={[
          "asset-tree-item",
          isSelected ? "is-selected" : "",
          isFocused ? "is-focused" : "",
          !canAct ? "is-display-only" : "",
        ].filter(Boolean).join(" ")}
      >
          <div
            className="asset-tree-row"
          style={{ "--asset-depth": depth } as CSSProperties}
        >
          <button
            type="button"
            className="asset-disclosure"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${element.name}`}
            disabled={childCount === 0}
            onClick={() => toggleExpanded(element.id)}
          >
            {childCount > 0 ? (isExpanded ? "v" : ">") : ""}
          </button>
          <button
            type="button"
            className="asset-tree-select"
            aria-label={`Select ${element.name}`}
            aria-pressed={isSelected}
            onClick={handleSelect}
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
              <span className={`asset-badge ${statusToneClass(element.status)}`}>{formatStatusLabel(element.status)}</span>
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
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="panel asset-tree-panel">
      <div className="panel-header">
        <h2>
          Assets ({displayElements.length})
          <span className="visually-hidden"> Elements</span>
        </h2>
        <span className="panel-header-kicker">Review queue</span>
      </div>
      <div className="asset-tree-summary" aria-label="Asset review summary">
        <span><strong>{summary.reviewed}</strong> Reviewed</span>
        <span><strong>{summary.accepted}</strong> Accepted</span>
        <span><strong>{summary.needsReview}</strong> Needs Review</span>
      </div>
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
        <button
          type="button"
          className="asset-review-complete-button"
          disabled={reviewableCount === 0}
          onClick={onCompleteReview}
        >
          Complete review
        </button>
      </div>
      <div className="panel-body panel-scroll">
        {tree.length > 0 ? (
          <div role="tree" aria-label="Asset tree" className="asset-tree">
            {tree.map((node) => renderNode(node, 0))}
          </div>
        ) : (
          <div className="asset-empty-state">
            <span className="asset-empty-icon" aria-hidden="true" />
            <strong>Model proposals pending</strong>
            <p>Run detection to fill this queue with reviewable candidates, confidence scores, and source tags.</p>
            <div className="asset-empty-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function buildAssetTree(elements: WorkspaceElement[]): AssetTreeNode[] {
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

function collectExpandableIds(nodes: AssetTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length > 0 ? [node.element.id] : []),
    ...collectExpandableIds(node.children),
  ]);
}

function summarizeAssets(elements: WorkspaceElement[]) {
  const reviewed = elements.filter(isReviewed).length;
  const accepted = elements.filter(isAccepted).length;
  const needsReviewCount = elements.filter(needsReview).length;
  return {
    reviewed,
    accepted,
    needsReview: needsReviewCount,
  };
}

function isActiveCandidate(element: WorkspaceElement): boolean {
  return element.mergedInto === null && element.mode !== "rejected" && element.status !== "rejected";
}

function isReviewed(element: WorkspaceElement): boolean {
  return [
    "accepted",
    "rejected",
    "exported",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
    "qa_failed",
  ].includes(element.status);
}

function needsReview(element: WorkspaceElement): boolean {
  return isActiveCandidate(element) && [
    "model_detected",
    "proposal",
    "edited",
    "child",
    "merged",
    "qa_failed",
  ].includes(element.status);
}

function isAccepted(element: WorkspaceElement): boolean {
  return [
    "accepted",
    "exported",
    "extract_ready",
    "extracted",
    "repair_pending",
    "repair_complete",
  ].includes(element.status);
}

function formatConfidence(confidence: number | null | undefined): string {
  return typeof confidence === "number" ? confidence.toFixed(2) : "No score";
}

function formatOriginLabel(element: WorkspaceElement): string {
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

function formatStatusLabel(status: WorkspaceElement["status"]): string {
  if (["accepted", "exported", "extract_ready", "extracted", "repair_complete"].includes(status)) {
    return "Accepted";
  }
  if (status === "rejected") {
    return "Rejected";
  }
  if (status === "edited") {
    return "Edited";
  }
  if (status === "child") {
    return "Child";
  }
  if (status === "merged") {
    return "Merged";
  }
  if (status === "split_parent") {
    return "Split source";
  }
  if (status === "repair_pending") {
    return "Repairing";
  }
  if (status === "qa_failed") {
    return "Needs fix";
  }
  return "Needs review";
}

function statusToneClass(status: WorkspaceElement["status"]): string {
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
