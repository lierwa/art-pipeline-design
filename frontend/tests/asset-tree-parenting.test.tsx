import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AssetTreePanel } from "../src/features/inspector/AssetTreePanel";
import { isAssetTreeDropDisabled, resolveAssetTreeMoveAction } from "../src/features/inspector/assetTreeModel";
import type { WorkspaceElement } from "../src/domain/workspace";

describe("asset tree parent editing", () => {
  it("maps tree move events to parent and root operations", () => {
    expect(resolveAssetTreeMoveAction([wallCabinet, bottlePlant, towel], "element_002", "element_001", 0)).toEqual({
      kind: "parent",
      parentId: "element_001",
    });
    expect(resolveAssetTreeMoveAction([wallCabinet, { ...bottlePlant, parentId: "element_001" }, towel], "element_002", null, 1)).toEqual({
      kind: "parent",
      parentId: null,
    });
  });

  it("maps same-parent tree move indexes to sibling reorder operations", () => {
    expect(resolveAssetTreeMoveAction([wallCabinet, bottlePlant, towel], "element_003", null, 0)).toEqual({
      kind: "reorder",
      targetElementId: "element_001",
      position: "before",
    });
    expect(resolveAssetTreeMoveAction([wallCabinet, bottlePlant, towel], "element_001", null, 2)).toEqual({
      kind: "reorder",
      targetElementId: "element_003",
      position: "after",
    });
  });

  it("rejects tree moves that would create invalid parent relationships", () => {
    expect(
      resolveAssetTreeMoveAction(
        [wallCabinet, { ...bottlePlant, parentId: "element_001" }, towel],
        "element_001",
        "element_002",
        0,
      ),
    ).toBeNull();
    expect(
      resolveAssetTreeMoveAction(
        [wallCabinet, { ...bottlePlant, status: "rejected" }, towel],
        "element_002",
        "element_001",
        0,
      ),
    ).toBeNull();
  });

  it("allows root drop targets from the tree boundary without reading a missing element", () => {
    expect(isAssetTreeDropDisabled(wallCabinet, undefined)).toBe(false);
    expect(isAssetTreeDropDisabled(wallCabinet, null)).toBe(false);
  });

  it("renders tree rows for active assets", () => {
    renderPanel();

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });
    const selectButton = within(towelItem).getByRole("button", { name: /select towel/i });

    expect(selectButton).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the large selectable asset area out of native button drag suppression", () => {
    renderPanel();

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });
    const selectControl = within(towelItem).getByRole("button", { name: /select towel/i });

    expect(selectControl.tagName).not.toBe("BUTTON");
  });

  it("shows every row without disclosure controls and groups generate selection with the thumbnail", () => {
    renderPanel({
      workflowStage: "mask",
      onToggleGenerateSelection: vi.fn(),
    });

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const cabinetItem = within(tree).getByRole("treeitem", { name: /wall cabinet/i });
    const row = cabinetItem.querySelector(".asset-tree-row");
    const content = cabinetItem.querySelector(".asset-tree-row-depth");
    const selectControl = within(cabinetItem).getByRole("button", { name: /select wall cabinet/i });
    const checkbox = within(cabinetItem).getByRole("checkbox", { name: /wall cabinet for generation/i });
    const thumbnail = cabinetItem.querySelector(".asset-tree-thumb");

    expect(within(tree).queryByRole("button", { name: /expand|collapse/i })).not.toBeInTheDocument();
    expect(row?.firstElementChild).toHaveClass("asset-tree-row-depth");
    expect(content?.firstElementChild).toHaveClass("asset-generate-toggle");
    expect(checkbox.closest(".asset-tree-row-depth")).toBe(content);
    expect(thumbnail.closest(".asset-tree-select")).toBe(selectControl);
  });

  it("keeps children expanded and lets child rows span the same width as parent rows", () => {
    renderPanel({
      elements: [wallCabinet, { ...bottlePlant, parentId: "element_001" }, towel],
      selectedElementId: "element_002",
      selectedElementIds: ["element_002"],
    });

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const childItem = within(tree).getByRole("treeitem", { name: /bottle \+ plant 2/i });
    const childRow = childItem.querySelector(".asset-tree-row");
    const childContent = childItem.querySelector(".asset-tree-row-depth");

    expect(childItem).toBeInTheDocument();
    expect(childRow?.firstElementChild).toHaveClass("asset-tree-row-depth");
    expect(childRow).toHaveClass("asset-tree-row");
    expect(childContent).toHaveAttribute("style", expect.stringContaining("--asset-depth: 1"));
  });

  it("renders asset and task metadata through one shared tag component", () => {
    renderPanel({
      taskItemsByElementId: {
        element_003: {
          elementId: "element_003",
          name: "towel",
          status: "succeeded",
          message: "Mask saved",
          startedAt: null,
          finishedAt: null,
          artifactPaths: {},
        },
      },
    });

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });
    const tags = towelItem.querySelectorAll(".asset-tag");

    expect(tags).toHaveLength(2);
    tags.forEach((tag) => {
      expect(tag).not.toHaveClass("asset-badge");
      expect(tag).not.toHaveClass("asset-task-badge");
    });
    expect(within(towelItem).getByText("Ready for mask")).toHaveClass("asset-tag", "asset-tag-success");
    expect(within(towelItem).getByText("Done")).toHaveClass("asset-tag", "asset-tag-success");
  });

  it("keeps the virtual tree height close to the visible row height", () => {
    renderPanel();

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const arboristTree = tree.querySelector(".asset-tree-arborist");

    expect(arboristTree).toHaveStyle({ height: "234px" });
  });

  it("shows generate selection in mask stage without selecting the row", () => {
    const onSelectElement = vi.fn();
    const onToggleGenerateSelection = vi.fn();
    renderPanel({
      workflowStage: "mask",
      generateSelection: { element_003: false },
      onSelectElement,
      onToggleGenerateSelection,
    });

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });
    const checkbox = within(towelItem).getByRole("checkbox", { name: /select towel for generation/i });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(onToggleGenerateSelection).toHaveBeenCalledWith("element_003", true);
    expect(onSelectElement).not.toHaveBeenCalled();
  });

  it("selects all eligible generate assets from the tree header in one batch", () => {
    const onSelectElement = vi.fn();
    const onToggleAllGenerateSelection = vi.fn();
    renderPanel({
      workflowStage: "mask",
      generateSelection: { element_001: true, element_002: false, element_003: true },
      onSelectElement,
      onToggleAllGenerateSelection,
    });

    const bulkToggle = screen.getByRole("checkbox", { name: /select all assets for generation/i });
    expect(bulkToggle.closest(".asset-tree-panel")).toHaveClass("has-tree-toolbar");
    expect(bulkToggle).toBePartiallyChecked();

    fireEvent.click(bulkToggle);

    expect(onToggleAllGenerateSelection).toHaveBeenCalledWith(
      ["element_001", "element_002", "element_003"],
      true,
    );
    expect(onSelectElement).not.toHaveBeenCalled();
  });

  it("clears all eligible generate assets when the tree header is fully selected", () => {
    const onToggleAllGenerateSelection = vi.fn();
    renderPanel({
      workflowStage: "generate",
      generateSelection: {},
      onToggleAllGenerateSelection,
    });

    const bulkToggle = screen.getByRole("checkbox", { name: /clear all assets for generation/i });
    expect(bulkToggle).toBeChecked();

    fireEvent.click(bulkToggle);

    expect(onToggleAllGenerateSelection).toHaveBeenCalledWith(
      ["element_001", "element_002", "element_003"],
      false,
    );
  });

  it("keeps hierarchy indent out of the generate and action columns", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).toContain(".asset-tree-panel.has-tree-toolbar");
    expect(css).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(css).toContain(".asset-tree-panel > .asset-tree-body");
    expect(css).toContain(".right-review-panel .asset-tree-panel > .asset-tree-body");
    expect(css).toContain("overflow: hidden");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 58px");
    expect(css).toContain("border: 1px solid transparent");
    expect(css).toContain(".asset-tree-row-depth");
    expect(css).toContain("grid-template-columns: 24px 42px minmax(0, 1fr)");
    expect(css).toContain("grid-column: 1");
    expect(css).toContain("--asset-tree-indent: 48px");
    expect(css).toContain("padding-left: calc(var(--asset-depth, 0) * var(--asset-tree-indent))");
    expect(css).toContain("grid-template-columns: 27px 27px");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain(".asset-tag");
    expect(css).not.toContain(".asset-badge");
    expect(css).not.toContain(".asset-task-badge");
    expect(css).not.toContain(".asset-disclosure");
    expect(css).toContain("height: 76px");
    expect(css).not.toContain("minmax(112px, auto)");
  });

  it("does not show final generation checkboxes during detect stage mask generation", () => {
    renderPanel({
      workflowStage: "detect",
      onToggleGenerateSelection: vi.fn(),
    });

    const tree = screen.getByRole("tree", { name: /asset tree/i });

    expect(within(tree).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("requires confirmation before removing an asset from active assets", () => {
    const onRejectElement = vi.fn();
    const onSelectElement = vi.fn();
    renderPanel({ onRejectElement, onSelectElement });

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });

    fireEvent.click(within(towelItem).getByRole("button", { name: /delete towel/i }));

    const dialog = screen.getByRole("alertdialog", { name: /remove from active assets/i });
    expect(within(dialog).getByText(/show rejected/i)).toBeInTheDocument();
    expect(onRejectElement).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /remove asset/i }));

    expect(onRejectElement).toHaveBeenCalledWith("element_003");
    expect(onSelectElement).not.toHaveBeenCalled();
  });
});

function renderPanel({
  onMoveElementToParent = vi.fn(),
  onRejectElement = vi.fn(),
  onReorderElement = vi.fn(),
  onSelectElement = vi.fn(),
  onToggleAllGenerateSelection,
  onToggleGenerateSelection,
  generateSelection,
  workflowStage,
  elements = [wallCabinet, bottlePlant, towel],
  taskItemsByElementId = {},
  selectedElementId = null,
  selectedElementIds = [],
}: {
  onMoveElementToParent?: (elementId: string, parentId: string | null) => void;
  onRejectElement?: Parameters<typeof AssetTreePanel>[0]["onRejectElement"];
  onReorderElement?: (elementId: string, targetElementId: string, position: "before" | "after") => void;
  onSelectElement?: Parameters<typeof AssetTreePanel>[0]["onSelectElement"];
  onToggleAllGenerateSelection?: Parameters<typeof AssetTreePanel>[0]["onToggleAllGenerateSelection"];
  onToggleGenerateSelection?: Parameters<typeof AssetTreePanel>[0]["onToggleGenerateSelection"];
  generateSelection?: Record<string, boolean>;
  workflowStage?: Parameters<typeof AssetTreePanel>[0]["workflowStage"];
  elements?: WorkspaceElement[];
  taskItemsByElementId?: Parameters<typeof AssetTreePanel>[0]["taskItemsByElementId"];
  selectedElementId?: string | null;
  selectedElementIds?: string[];
} = {}) {
  return render(
    <AssetTreePanel
      elements={elements}
      selectedElementId={selectedElementId}
      selectedElementIds={selectedElementIds}
      workspaceRunId={null}
      assetCacheKey={0}
      showRejected={false}
      hasRejectedElements={false}
      reviewableCount={0}
      taskItemsByElementId={taskItemsByElementId}
      workflowStage={workflowStage}
      generateSelection={generateSelection}
      onSelectElement={onSelectElement}
      onToggleShowRejected={vi.fn()}
      onToggleVisibility={vi.fn()}
      onCompleteReview={vi.fn()}
      onMoveElementToParent={onMoveElementToParent}
      onRejectElement={onRejectElement}
      onReorderElement={onReorderElement}
      onToggleAllGenerateSelection={onToggleAllGenerateSelection}
      onToggleGenerateSelection={onToggleGenerateSelection}
    />,
  );
}

const wallCabinet = makeElement({
  id: "element_001",
  name: "wall cabinet",
  label: "wall cabinet",
  source: "manual",
  sourceProvider: null,
});

const bottlePlant = makeElement({
  id: "element_002",
  name: "bottle + plant 2",
  label: "bottle + plant 2",
});

const towel = makeElement({
  id: "element_003",
  name: "towel",
  label: "towel",
});

function makeElement(
  overrides: Partial<WorkspaceElement>,
): WorkspaceElement {
  return {
    id: "element_base",
    name: "Asset",
    label: "Asset",
    status: "accepted",
    mode: "visible_only",
    assetRole: "sticker",
    removeFromParent: null,
    segmentationStatus: "not_started",
    segmentationQuality: null,
    repairStatus: "not_required",
    exportStatus: "not_ready",
    bbox: { x: 10, y: 10, w: 20, h: 20 },
    canvas: { x: 10, y: 10, w: 20, h: 20 },
    layer: 1,
    thumbnail: null,
    mask: null,
    parentId: null,
    source: "model_detection",
    sourceProvider: "grounding_dino",
    sourcePrompt: "asset",
    notes: "",
    visible: true,
    confidence: 0.9,
    history: [],
    mergedInto: null,
    exportParent: false,
    ...overrides,
  };
}
