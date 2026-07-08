import {
  describe,
  expect,
  fireEvent,
  it,
  render,
  screen,
  within,
} from "../app/appTestHarness";
import React from "react";
import { vi } from "vitest";

import {
  addAssetPlacement,
  createAssemblyDraft,
  groupPlacements,
  projectManifestForSave,
  removePlacementGroup,
  type AssemblyManifestDraft,
} from "../../src/features/coursePlanner/assembly/assemblyManifestDraft";
import {
  buildLayerDropTargets,
  buildLayerTreeData,
  createMovedLayerDraft,
} from "../../src/features/coursePlanner/components/assemblyLayerTreeModel";
import {
  sceneAsset,
  studioScenePackageFixture,
} from "./chapterWorkspaceFixtures";

import { AssemblyLayerTree } from "../../src/features/coursePlanner/components/AssemblyLayerTree";

describe("assemblyLayerTreeModel", () => {
  it("moves a root layer block while keeping layer_order[0] frontmost", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["group_1"],
      parentId: null,
      index: 0,
    });

    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cloth",
      "placement_bowl",
      "placement_chapter_asset_cup",
    ]);
  });

  it("moves a placement upward to the frontmost layer_order position", () => {
    const draft = createAssemblyDraft(scenePackageWithAssets([
      sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
    ]));
    const withCloth = addAssetPlacement(draft, "chapter_asset_cloth");
    const treeData = buildLayerTreeData(withCloth);

    const movedDraft = createMovedLayerDraft(withCloth, treeData, {
      dragIds: ["placement_bowl"],
      parentId: null,
      index: 0,
    });

    expect(movedDraft?.layer_order).toEqual(["placement_bowl", "placement_chapter_asset_cloth"]);
  });

  it("moves an ungrouped root placement into an existing group", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["placement_chapter_asset_cup"],
      parentId: "group_1",
      index: 1,
    });

    expect(movedDraft?.groups[0]?.placement_ids).toEqual([
      "placement_chapter_asset_cloth",
      "placement_chapter_asset_cup",
      "placement_bowl",
    ]);
    expect(movedDraft?.placements.map((placement) => ({
      id: placement.id,
      group_id: placement.group_id,
    }))).toEqual([
      { id: "placement_bowl", group_id: "group_1" },
      { id: "placement_chapter_asset_cloth", group_id: "group_1" },
      { id: "placement_chapter_asset_cup", group_id: "group_1" },
    ]);
    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cloth",
      "placement_chapter_asset_cup",
      "placement_bowl",
    ]);
  });

  it("moves an ungrouped root placement into the last group position when dropped on group end", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["placement_chapter_asset_cup"],
      parentId: "group_1",
      index: 2,
    });

    expect(movedDraft?.groups[0]?.placement_ids).toEqual([
      "placement_chapter_asset_cloth",
      "placement_bowl",
      "placement_chapter_asset_cup",
    ]);
    expect(movedDraft?.placements.find((placement) => placement.id === "placement_chapter_asset_cup")?.group_id).toBe("group_1");
    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cloth",
      "placement_bowl",
      "placement_chapter_asset_cup",
    ]);
  });

  it("projects explicit root and group drop targets around an expanded group", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    expect(buildLayerDropTargets(treeData).map((target) => ({
      id: target.id,
      parentId: target.parentId,
      index: target.index,
      kind: target.kind,
    }))).toEqual([
      { id: "root-before-placement_chapter_asset_cup", parentId: null, index: 0, kind: "root" },
      { id: "root-before-group_1", parentId: null, index: 1, kind: "root" },
      { id: "group-group_1-before-placement_chapter_asset_cloth", parentId: "group_1", index: 0, kind: "group-child" },
      { id: "group-group_1-before-placement_bowl", parentId: "group_1", index: 1, kind: "group-child" },
      { id: "group-group_1-end", parentId: "group_1", index: 2, kind: "group-child" },
      { id: "root-end", parentId: null, index: 2, kind: "root" },
    ]);
  });

  it("moves a group child back to root and dissolves the group if it becomes degenerate", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["placement_bowl"],
      parentId: "__REACT_ARBORIST_INTERNAL_ROOT__",
      index: 1,
    });

    expect(movedDraft?.groups).toEqual([]);
    expect(movedDraft?.placements.map((placement) => ({ id: placement.id, group_id: placement.group_id }))).toEqual([
      { id: "placement_bowl", group_id: null },
      { id: "placement_chapter_asset_cloth", group_id: null },
      { id: "placement_chapter_asset_cup", group_id: null },
    ]);
    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cup",
      "placement_bowl",
      "placement_chapter_asset_cloth",
    ]);
  });

  it("moves a group child to root when dropped on the root target after the expanded group", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["placement_bowl"],
      parentId: null,
      index: 2,
    });

    expect(movedDraft?.groups).toEqual([]);
    expect(movedDraft?.placements.map((placement) => ({ id: placement.id, group_id: placement.group_id }))).toEqual([
      { id: "placement_bowl", group_id: null },
      { id: "placement_chapter_asset_cloth", group_id: null },
      { id: "placement_chapter_asset_cup", group_id: null },
    ]);
    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cup",
      "placement_chapter_asset_cloth",
      "placement_bowl",
    ]);
  });

  it("reorders children inside an existing group in both layer_order and group placement ids", () => {
    const draft = breakfastGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["placement_bowl"],
      parentId: "group_1",
      index: 0,
    });

    expect(movedDraft?.layer_order).toEqual([
      "placement_chapter_asset_cup",
      "placement_bowl",
      "placement_chapter_asset_cloth",
    ]);
    expect(movedDraft?.groups[0]?.placement_ids).toEqual([
      "placement_bowl",
      "placement_chapter_asset_cloth",
    ]);
  });

  it("rejects moving a group into another group", () => {
    const draft = twoGroupDraft();
    const treeData = buildLayerTreeData(draft);

    const movedDraft = createMovedLayerDraft(draft, treeData, {
      dragIds: ["group_1"],
      parentId: "group_2",
      index: 0,
    });

    expect(movedDraft).toBeNull();
  });

  it("deletes a group with its child placements from the manifest boundary", () => {
    const draft = breakfastGroupDraft();

    const nextDraft = removePlacementGroup(draft, "group_1");

    expect(nextDraft.groups).toEqual([]);
    expect(nextDraft.placements.map((placement) => placement.id)).toEqual(["placement_chapter_asset_cup"]);
    expect(nextDraft.layer_order).toEqual(["placement_chapter_asset_cup"]);
  });

  it("allows the same Chapter Asset to appear as distinct placement rows without renaming the source asset", () => {
    const draft = createAssemblyDraft(studioScenePackageFixture());

    const withSecondBowl = addAssetPlacement(draft, "chapter_asset_bowl");
    const withThirdBowl = addAssetPlacement(withSecondBowl, "chapter_asset_bowl");
    const manifest = projectManifestForSave(withThirdBowl);

    expect(withThirdBowl.placements.map((placement) => ({
      id: placement.id,
      asset_id: placement.asset_id,
      display_name: placement.display_name,
    }))).toEqual([
      { id: "placement_bowl", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl" },
      { id: "placement_chapter_asset_bowl", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl 2" },
      { id: "placement_chapter_asset_bowl_2", asset_id: "chapter_asset_bowl", display_name: "Breakfast bowl 3" },
    ]);
    expect(withThirdBowl.asset_catalog.chapter_asset_bowl?.display_name).toBe("Breakfast bowl");
    expect(manifest.placements.map((placement) => placement.display_name)).toEqual([
      "Breakfast bowl",
      "Breakfast bowl 2",
      "Breakfast bowl 3",
    ]);
  });

  it("renders live AssemblyLayerTree groups with placement children", () => {
    const scenePackage = scenePackageWithAssets([
      sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
    ]);
    const draft = breakfastGroupDraft(scenePackage);

    renderAssemblyLayerTree({ draft, scenePackage });

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(within(layerTree).getByRole("button", { name: "Breakfast props Group" })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth Target/i })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl Target/i })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Milk cup Target/i })).toBeInTheDocument();
    expect(within(layerTree).getByLabelText("Drop into Breakfast props at end")).toBeInTheDocument();
  });

  it("uses live AssemblyLayerTree selection reducer for toggle and shift range", () => {
    const scenePackage = scenePackageWithAssets([
      sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
      sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
    ]);
    const draft = breakfastGroupDraft(scenePackage);
    const onSelectNodeIds = vi.fn();
    const onSelectPlacement = vi.fn();

    const { rerender } = renderAssemblyLayerTree({
      draft,
      onSelectNodeIds,
      onSelectPlacement,
      scenePackage,
      selectedNodeIds: [],
      selectedPlacementId: null,
    });
    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    fireEvent.click(within(layerTree).getByRole("button", { name: /Cleanup cloth Target/i }));

    expect(onSelectNodeIds).toHaveBeenLastCalledWith(["placement_chapter_asset_cloth"]);
    expect(onSelectPlacement).toHaveBeenLastCalledWith("placement_chapter_asset_cloth");

    rerender(React.createElement(AssemblyLayerTree, {
      draft,
      onDraftChange: vi.fn(),
      onSelectNodeIds,
      onSelectPlacement,
      scenePackage,
      selectedNodeIds: ["placement_chapter_asset_cloth"],
      selectedPlacementId: "placement_chapter_asset_cloth",
    }));

    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl Target/i }), { shiftKey: true });

    expect(onSelectNodeIds).toHaveBeenLastCalledWith([
      "placement_chapter_asset_cloth",
      "placement_bowl",
    ]);
    expect(onSelectPlacement).toHaveBeenLastCalledWith("placement_bowl");

    rerender(React.createElement(AssemblyLayerTree, {
      draft,
      onDraftChange: vi.fn(),
      onSelectNodeIds,
      onSelectPlacement,
      scenePackage,
      selectedNodeIds: ["placement_chapter_asset_cloth", "placement_bowl"],
      selectedPlacementId: "placement_bowl",
    }));

    fireEvent.click(within(layerTree).getByRole("button", { name: /Breakfast bowl Target/i }), { ctrlKey: true });

    expect(onSelectNodeIds).toHaveBeenLastCalledWith([
      "placement_chapter_asset_cloth",
    ]);
  });

});

function renderAssemblyLayerTree({
  draft,
  onDraftChange = vi.fn(),
  onSelectNodeIds = vi.fn(),
  onSelectPlacement = vi.fn(),
  scenePackage,
  selectedNodeIds = [],
  selectedPlacementId = null,
}: {
  draft: AssemblyManifestDraft;
  onDraftChange?: (draft: AssemblyManifestDraft) => void;
  onSelectNodeIds?: (nodeIds: string[]) => void;
  onSelectPlacement?: (placementId: string | null) => void;
  scenePackage: ReturnType<typeof studioScenePackageFixture>;
  selectedNodeIds?: string[];
  selectedPlacementId?: string | null;
}) {
  return render(React.createElement(AssemblyLayerTree, {
    draft,
    onDraftChange,
    onSelectNodeIds,
    onSelectPlacement,
    scenePackage,
    selectedNodeIds,
    selectedPlacementId,
  }));
}

function breakfastGroupDraft(scenePackage = scenePackageWithAssets([
  sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
  sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
])): AssemblyManifestDraft {
  const draft = createAssemblyDraft(scenePackage);
  const withCloth = addAssetPlacement(draft, "chapter_asset_cloth");
  const withCup = addAssetPlacement(withCloth, "chapter_asset_cup");
  return groupPlacements(
    withCup,
    ["placement_chapter_asset_cloth", "placement_bowl"],
    "Breakfast props",
  );
}

function twoGroupDraft(scenePackage = scenePackageWithAssets([
  sceneAsset("chapter_asset_cloth", "Cleanup cloth", "cloth.png", { linkedTargetObjectId: "target_object_cloth" }),
  sceneAsset("chapter_asset_cup", "Milk cup", "cup.png"),
  sceneAsset("chapter_asset_spoon", "Soup spoon", "spoon.png"),
])): AssemblyManifestDraft {
  const draft = createAssemblyDraft(scenePackage);
  const withCloth = addAssetPlacement(draft, "chapter_asset_cloth");
  const withCup = addAssetPlacement(withCloth, "chapter_asset_cup");
  const withSpoon = addAssetPlacement(withCup, "chapter_asset_spoon");
  const withFirstGroup = groupPlacements(
    withSpoon,
    ["placement_chapter_asset_cloth", "placement_bowl"],
    "Breakfast props",
  );
  return groupPlacements(
    withFirstGroup,
    ["placement_chapter_asset_cup", "placement_chapter_asset_spoon"],
    "Table props",
  );
}

function scenePackageWithAssets(assets: ReturnType<typeof sceneAsset>[]) {
  return studioScenePackageFixture({
    chapter_assets: [
      ...studioScenePackageFixture().chapter_assets,
      ...assets,
    ],
  });
}
