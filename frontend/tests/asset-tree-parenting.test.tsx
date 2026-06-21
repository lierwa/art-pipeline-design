import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetTreePanel } from "../src/features/inspector/AssetTreePanel";
import {
  getAssetTreeDropIntentFromOffset,
  resolveAssetTreeDropAction,
} from "../src/features/inspector/assetTreeModel";
import type { WorkspaceElement } from "../src/domain/workspace";

describe("asset tree parent editing", () => {
  it("resolves a center drop as a parent relationship", () => {
    expect(
      resolveAssetTreeDropAction([wallCabinet, bottlePlant, towel], "element_002", "element_001", "inside"),
    ).toEqual({ kind: "parent" });
  });

  it("resolves edge drops as sibling reorder actions", () => {
    expect(getAssetTreeDropIntentFromOffset(2, 40)).toBe("before");
    expect(getAssetTreeDropIntentFromOffset(38, 40)).toBe("after");

    expect(
      resolveAssetTreeDropAction([wallCabinet, bottlePlant, towel], "element_003", "element_001", "before"),
    ).toEqual({ kind: "reorder", position: "before" });
  });

  it("renders dnd-kit sortable handles on active asset rows", () => {
    renderPanel();

    const tree = screen.getByRole("tree", { name: /asset tree/i });
    const towelItem = within(tree).getByRole("treeitem", { name: /towel/i });
    const selectButton = within(towelItem).getByRole("button", { name: /select towel/i });

    expect(selectButton).toHaveAttribute("aria-describedby");
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
});

function renderPanel({
  onMoveElementToParent = vi.fn(),
  onReorderElement = vi.fn(),
  onSelectElement = vi.fn(),
  onToggleGenerateSelection,
  generateSelection,
  workflowStage,
}: {
  onMoveElementToParent?: (elementId: string, parentId: string | null) => void;
  onReorderElement?: (elementId: string, targetElementId: string, position: "before" | "after") => void;
  onSelectElement?: Parameters<typeof AssetTreePanel>[0]["onSelectElement"];
  onToggleGenerateSelection?: Parameters<typeof AssetTreePanel>[0]["onToggleGenerateSelection"];
  generateSelection?: Record<string, boolean>;
  workflowStage?: Parameters<typeof AssetTreePanel>[0]["workflowStage"];
} = {}) {
  return render(
    <AssetTreePanel
      elements={[wallCabinet, bottlePlant, towel]}
      selectedElementId={null}
      selectedElementIds={[]}
      workspaceRunId={null}
      assetCacheKey={0}
      showRejected={false}
      hasRejectedElements={false}
      reviewableCount={0}
      workflowStage={workflowStage}
      generateSelection={generateSelection}
      onSelectElement={onSelectElement}
      onToggleShowRejected={vi.fn()}
      onToggleVisibility={vi.fn()}
      onCompleteReview={vi.fn()}
      onMoveElementToParent={onMoveElementToParent}
      onReorderElement={onReorderElement}
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
