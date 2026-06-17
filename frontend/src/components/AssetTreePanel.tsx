import { CSSProperties, useEffect, useMemo, useState } from "react";

import { SelectedElementIds, thumbnailUrl, WorkspaceElement } from "../workspace";

type AssetTreePanelProps = {
  elements: WorkspaceElement[];
  selectedElementId: string | null;
  selectedElementIds: SelectedElementIds;
  workspaceRunId: string | null;
  assetCacheKey: number;
  showRejected: boolean;
  onSelectElement: (elementId: string) => void;
  onToggleMergeSelection: (elementId: string) => void;
  onToggleShowRejected: () => void;
  onToggleVisibility: (elementId: string) => void;
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
  onSelectElement,
  onToggleMergeSelection,
  onToggleShowRejected,
  onToggleVisibility,
}: AssetTreePanelProps) {
  const displayElements = useMemo(
    () => elements.filter((element) => element.mergedInto === null),
    [elements],
  );
  const tree = useMemo(() => buildAssetTree(displayElements), [displayElements]);
  const summary = useMemo(() => summarizeAssets(displayElements), [displayElements]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      collectExpandableIds(tree).forEach((elementId) => next.add(elementId));
      return Array.from(next);
    });
  }, [tree]);

  const expandedSet = new Set(expandedIds);

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
    const isSelected = selectedElementId === element.id;
    const canAct = isActiveCandidate(element);
    const canMerge = canAct && element.visible;
    const labelId = `asset-tree-label-${element.id}`;
    const thumbUrl = thumbnailUrl(element.thumbnail, assetCacheKey, workspaceRunId);

    return (
      <div
        key={element.id}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-expanded={childCount > 0 ? isExpanded : undefined}
        aria-labelledby={labelId}
        className={`asset-tree-item${isSelected ? " is-selected" : ""}${!canAct ? " is-display-only" : ""}`}
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
          {canMerge ? (
            <label className="asset-merge-checkbox">
              <input
                aria-label={`Select ${element.name} for merge`}
                type="checkbox"
                checked={selectedElementIds.includes(element.id)}
                onChange={() => onToggleMergeSelection(element.id)}
              />
            </label>
          ) : (
            <span className="asset-merge-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="asset-tree-select"
            aria-label={`Select ${element.name} asset ${element.name} thumbnail`}
            onClick={() => onSelectElement(element.id)}
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
              <span>{formatConfidence(element.confidence)}</span>
            </span>
            <span className="asset-tree-badges" aria-label={`${element.name} metadata`}>
              <span className={`asset-badge ${statusToneClass(element.status)}`}>{element.status}</span>
              {element.sourceProvider ? (
                <span className="asset-badge asset-badge-source">{element.sourceProvider}</span>
              ) : null}
            </span>
          </button>
          {canAct ? (
            <label className="asset-visibility-toggle">
              <input
                aria-label={`Toggle visibility for ${element.name}`}
                type="checkbox"
                checked={element.visible}
                onChange={() => onToggleVisibility(element.id)}
              />
              <span>{element.visible ? "Visible" : "Hidden"}</span>
            </label>
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
  return {
    reviewed,
    accepted,
    needsReview: Math.max(0, elements.length - reviewed),
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
