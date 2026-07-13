import "./assemblyEditorDependencyMocks";
import { useEffect, useMemo, useRef, useState } from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import {
  cleanup,
  describe,
  expect,
  fireEvent,
  it,
  mockRect,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "../app/appTestHarness";
import type { DirectChapterAssetUploadInput } from "../../src/features/coursePlanner/api";
import {
  buildAssemblyReadiness,
  isAssemblyReady,
} from "../../src/features/coursePlanner/assembly/assemblyReadiness";
import { createAssemblyDraft } from "../../src/features/coursePlanner/assembly/assemblyManifestDraft";
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";
import {
  buildLayerTreeData,
  createMovedLayerDraft,
} from "../../src/features/coursePlanner/components/assemblyLayerTreeModel";
import { preserveAssemblySelection } from "../../src/features/coursePlanner/components/useAssemblyWorkspaceSaveController";
import { studioStatusLabel } from "../../src/features/coursePlanner/pages/ChapterWorkspacePage";
import type {
  AsyncStatusMap,
  ChapterSceneAssemblyManifest,
  ChapterScenePackage,
} from "../../src/features/coursePlanner/types";
import {
  characterIpFixture,
  referenceImageFixture,
  sceneAsset,
  snapshot,
  STUDIO_CHAPTER_ID,
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceFixtures";
import { renderChapterWorkspace } from "./chapterWorkspaceTestHelpers";
import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  AssemblyEditorHarness,
  type AssemblyEditorHarnessControls,
  advanceAutosaveCycle,
  advanceAutosaveTime,
  buildLockedFinalScene,
  emptyAssemblyManifest,
  flushAsyncScenePackage,
  mockCanvasBlob,
  mockScenePackageImages,
  scenePackageWithDependentPlacements,
  scenePackageWithGroupedPlacements,
  scenePackageWithReplacementCandidate,
  scenePackageWithTwoPlacements,
  scenePackageWithTwoPlacementsConfig,
} from "./assemblyEditorHarness";
import { layerLabels } from "./assemblyEditorTestUtils";
beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(performance.now());
    return 1;
  }) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function expectIconOnlySaveButton() {
  expect(screen.queryByText("Save Assembly")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save Assembly" })).not.toBeInTheDocument();
  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton).toHaveClass("shared-icon-button");
  expect(saveButton).not.toHaveClass("shared-icon-button-with-label");
  return saveButton;
}

describe("Assembly editor layers", () => {
  it("renders the Assembly editor route landmarks", async () => {
    const view = renderChapterWorkspace({
      route: `/course-planner/chapters/${STUDIO_CHAPTER_ID}/assembly`,
      scenePackage: studioScenePackageFixture(),
    });

    try {
      const banner = await screen.findByRole("banner");
      expect(within(banner).getByRole("heading", { name: "Course Planner" })).toBeInTheDocument();
      expect(within(banner).getByRole("navigation", { name: "Product areas" })).toBeInTheDocument();

      const workspace = await screen.findByRole("region", { name: "Assembly workspace" });
      expect(within(workspace).getByText("Assembly")).toBeInTheDocument();
      expect(within(workspace).getByText("早餐厨房")).toBeInTheDocument();
      expect(within(workspace).getByRole("link", { name: "Back to Chapter" })).toHaveAttribute(
        "href",
        `/course-planner/chapters/${encodeURIComponent(STUDIO_CHAPTER_ID)}`,
      );
    } finally {
      view.restore();
    }
  });

  it("adds an unused asset into the assembly, marks it used, and saves the manifest", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const scenePackage = studioScenePackageFixture({
      chapter_assets: [
        sceneAsset("chapter_asset_cup", "Milk cup", "milk-cup.png", { linkedTargetObjectId: "target_object_cloth" }),
      ],
      assembly: emptyAssemblyManifest(),
    });
    render(<AssemblyEditorHarness initialScenePackage={scenePackage} />);

    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    const milkCupCard = screen.getByText("Milk cup").closest("article");
    expect(milkCupCard).toBeInTheDocument();
    await user.click(within(milkCupCard as HTMLElement).getByRole("button", { name: "Add to Assembly" }));

    expect(await screen.findByText("Saving changes")).toBeInTheDocument();
    expect(within(milkCupCard as HTMLElement).getByText("1 use")).toBeInTheDocument();
    expect(within(milkCupCard as HTMLElement).getByRole("button", { name: "Asset actions for Milk cup" })).toBeInTheDocument();
    expect(screen.getByText("1 placement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milk cup target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Milk cup");

    await user.click(expectIconOnlySaveButton());

    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(expectIconOnlySaveButton()).toBeDisabled();
  });

  it("locates the used asset placement and syncs selection across placement list and property panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    await user.click(screen.getByRole("button", { name: "Asset actions for Breakfast bowl" }));
    await user.click(screen.getByRole("menuitem", { name: "Locate placement" }));

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl/, pressed: true })).toBeInTheDocument();
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getAllByText("Breakfast bowl").length).toBeGreaterThan(0);
    expect(properties).not.toHaveTextContent("chapter_asset_bowl");
    expect(within(properties).getByRole("button", { name: "Target" })).toHaveAttribute("aria-pressed", "true");
  });

  it("syncs selection between placement list rows, status metrics, and canvas clicks", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));

    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Cleanup cloth");
    const statusBar = screen.getByLabelText("Assembly editor status");
    expect(statusBar).toHaveTextContent("X 635");
    expect(statusBar).toHaveTextContent("Y 553");
    expect(statusBar).toHaveTextContent("W 143");
    expect(statusBar).toHaveTextContent("H 143");

    const canvasRegion = screen.getByRole("region", { name: "Assembly canvas" });
    const artboard = within(canvasRegion).getByTestId("canvas-artboard");
    const drawingSurface = within(canvasRegion).getByTestId("canvas-drawing-surface");
    mockRect(artboard, { left: 0, top: 0, width: 1024, height: 1024 });
    fireEvent.mouseDown(drawingSurface, { clientX: 430, clientY: 594, button: 0 });

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Breakfast bowl");
  });

  it("renders placement rows without fake layer toolbar or disabled row actions", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    const layerActions = within(layerTree).getByRole("toolbar", { name: "Layer actions" });
    expect(within(layerActions).getByRole("button", { name: "Delete Breakfast bowl placement" })).toHaveClass("assembly-layer-panel-delete-button");
    expect(within(layerTree).queryByRole("button", { name: "Add layer" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Duplicate layer" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move layer up" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move layer down" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Delete layer" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Bring Breakfast bowl to front" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Bring Cleanup cloth to front" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move Breakfast bowl forward" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move Cleanup cloth backward" })).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("tree", { name: "Placement layer order" })).toBeInTheDocument();
    expect(layerTree.querySelector(".assembly-layer-native-tree")).toBeInTheDocument();
    const bowlRow = within(layerTree).getByRole("button", { name: /Breakfast bowl target/ });
    expect(bowlRow).toBeInTheDocument();
    expect(bowlRow.tagName).not.toBe("BUTTON");
    const bowlLayerRow = bowlRow.closest(".assembly-layer-row") as HTMLElement;
    expect(bowlLayerRow).toBeInTheDocument();
    expect(bowlLayerRow.querySelector(".assembly-layer-thumb")).toBeInTheDocument();
    expect(bowlLayerRow.querySelector(".assembly-layer-drag-affordance")).not.toBeInTheDocument();
    expect(bowlLayerRow.querySelector(".assembly-layer-name")).toHaveTextContent("Breakfast bowl");
    expect(bowlLayerRow.querySelector(".assembly-layer-role")).toHaveTextContent("Target");
    expectLayerRowOrder(bowlLayerRow);
    expect(within(bowlLayerRow).getByRole("button", { name: "Hide Breakfast bowl" })).toHaveClass("assembly-layer-visibility-button");
    expect(within(bowlLayerRow).queryByRole("button", { name: "Delete Breakfast bowl placement" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByLabelText("Lock Breakfast bowl")).not.toBeInTheDocument();
    expect(within(layerTree).queryByLabelText("Drag Breakfast bowl layer")).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "More actions for Breakfast bowl" })).not.toBeInTheDocument();
    expect(within(layerTree).getAllByText("Target").length).toBeGreaterThan(0);
    expect(layerTree).not.toHaveTextContent("chapter_asset_bowl");
  });

  it("clears placement selection when Ctrl-clicking the selected layer row", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    const bowlRow = within(layerTree).getByRole("button", { name: /Breakfast bowl target/ });
    await user.click(bowlRow);
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();

    fireEvent.click(bowlRow, { ctrlKey: true });

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: false })).toBeInTheDocument();
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(properties).toHaveTextContent("No selection");
    expect(properties).toHaveTextContent("Select a placement to inspect its details.");
  });

  it("keeps UUID-only asset identifiers out of layer rows while preserving row thumbnails", async () => {
    mockScenePackageImages();
    const uuidAssetId = "40764843-f70d-48dd-9d6a-8475a3fff53d";
    const dependencyUuidAssetId = "4e29bf91-7146-4f3e-9c6c-091d8e7f7bd9";
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset(uuidAssetId, uuidAssetId, `${uuidAssetId}.png`, { linkedTargetObjectId: "target_object_bowl" }),
            sceneAsset(dependencyUuidAssetId, dependencyUuidAssetId, `${dependencyUuidAssetId}.png`, { linkedTargetObjectId: "target_object_cloth" }),
          ],
          assembly: {
            ...emptyAssemblyManifest(),
            placements: [
              {
                id: "placement_uuid_primary",
                asset_id: uuidAssetId,
                display_name: uuidAssetId,
                runtime_role: "target",
                transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
                group_id: null,
                requires_placed: [],
              },
              {
                id: "placement_uuid_dependency",
                asset_id: dependencyUuidAssetId,
                display_name: dependencyUuidAssetId,
                runtime_role: "initial",
                transform: { cx: 0.62, cy: 0.54, w: 0.14, h: 0.14, rotation_deg: 0 },
                group_id: null,
                requires_placed: [],
              },
            ],
            layer_order: ["placement_uuid_primary", "placement_uuid_dependency"],
          },
        })}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(layerTree).not.toHaveTextContent(uuidAssetId);
    expect(layerTree).not.toHaveTextContent(dependencyUuidAssetId);

    const primaryRow = within(layerTree).getByRole("button", { name: /Unnamed target asset 1 target/ }).closest(".assembly-layer-row") as HTMLElement;
    expect(primaryRow).toBeInTheDocument();
    expect(primaryRow.querySelector(".assembly-layer-thumb")).toBeInTheDocument();
    expect(primaryRow.querySelector(".assembly-layer-name")).toHaveTextContent("Unnamed target asset 1");
    expect(primaryRow.querySelector(".assembly-layer-role")).toHaveTextContent("Target");
    expectLayerRowOrder(primaryRow);
    expect(within(layerTree).getByRole("button", { name: /Unnamed target asset 2 initial/ })).toBeInTheDocument();
  });

  it("keeps long layer names in their own column without swallowing role and visibility actions", () => {
    mockScenePackageImages();
    const longName = "Morning sun patch with a very long generated placement name";
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset("chapter_asset_long_name", longName, "sun-patch.png", { linkedTargetObjectId: "target_object_bowl" }),
          ],
          assembly: {
            ...emptyAssemblyManifest(),
            placements: [
              {
                id: "placement_long_name",
                asset_id: "chapter_asset_long_name",
                display_name: longName,
                runtime_role: "target",
                transform: { cx: 0.42, cy: 0.58, w: 0.18, h: 0.18, rotation_deg: 0 },
                group_id: null,
                requires_placed: [],
              },
            ],
            layer_order: ["placement_long_name"],
          },
        })}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    const row = within(layerTree).getByRole("button", { name: /Morning sun patch.*target/ }).closest(".assembly-layer-row") as HTMLElement;
    const name = row.querySelector(".assembly-layer-name");
    const role = row.querySelector(".assembly-layer-role");
    const actions = row.querySelector(".assembly-layer-row-actions");

    expect(name).toHaveTextContent(longName);
    expect(name?.parentElement).toHaveClass("assembly-layer-row-select");
    expect(role).toHaveTextContent("Target");
    expect(actions).toContainElement(role as HTMLElement);
    expect(within(row).getByRole("button", { name: `Hide ${longName}` })).toHaveClass("assembly-layer-visibility-button");
    expect(isBefore(name, actions)).toBe(true);
  });

  it("duplicates the used asset into a second unused row without copying placement", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    await user.click(screen.getByRole("button", { name: "Asset actions for Breakfast bowl" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate asset" }));

    const rows = within(screen.getByRole("region", { name: "Assembly asset pool" })).getAllByRole("article");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] ?? document.body).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(rows[1] ?? document.body).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(rows[0] ?? document.body).getByRole("button", { name: "Asset actions for Breakfast bowl" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: "Add to Assembly" })
        .some((button) => !button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("filters the asset pool with search", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          chapter_assets: [
            sceneAsset("chapter_asset_bowl", "Breakfast bowl", "bowl.png", { linkedTargetObjectId: "target_object_bowl" }),
            sceneAsset("chapter_asset_spoon", "Spoon", "spoon.png"),
          ],
        })}
      />,
    );

    const pool = screen.getByRole("region", { name: "Assembly asset pool" });
    const search = within(pool).getByRole("searchbox", { name: "Search assets" });
    expect(within(pool).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(pool).getByText("Spoon")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "bowl" } });
    await waitFor(() => {
      expect(within(pool).queryByText("Spoon")).not.toBeInTheDocument();
      expect(within(pool).getByText("Breakfast bowl")).toBeInTheDocument();
    });

    fireEvent.change(search, { target: { value: "spoon" } });
    await waitFor(() => {
      expect(within(pool).queryByText("Breakfast bowl")).not.toBeInTheDocument();
      expect(within(pool).getByText("Spoon")).toBeInTheDocument();
    });
  });

  it("keeps the placement layer tree ordered from front to back without exposing arrow controls", async () => {
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);
    expect(within(layerTree).getByRole("tree", { name: "Placement layer order" })).toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Bring Cleanup cloth to front" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move Cleanup cloth forward" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Move Breakfast bowl backward" })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Send Breakfast bowl to back" })).not.toBeInTheDocument();
  });

  it("moves a root placement when Arborist reports the internal root parent", () => {
    const draft = createAssemblyDraft(scenePackageWithTwoPlacements());
    const movedDraft = createMovedLayerDraft(draft, buildLayerTreeData(draft), {
      dragIds: ["placement_cloth"],
      parentId: "__REACT_ARBORIST_INTERNAL_ROOT__",
      index: 0,
    });

    expect(movedDraft?.layer_order).toEqual(["placement_cloth", "placement_bowl"]);
  });

  it("syncs layer row drag reorder with canvas z-order", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);
    expect(canvasOverlayOrder()).toEqual(["placement_cloth", "placement_bowl"]);

    await act(async () => {
      dragLayerToDropZone(layerTree, /Cleanup cloth target/, "Drop at root before Breakfast bowl");
    });

    expect(layerLabels(layerTree)).toEqual(["Cleanup cloth", "Breakfast bowl"]);
    expect(canvasOverlayOrder()).toEqual(["placement_bowl", "placement_cloth"]);
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("X 635");
  });

  it("moves a root placement into a group through the draggable layer tree", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const baseScenePackage = scenePackageWithGroupedPlacements();
    const scenePackage: ChapterScenePackage = {
      ...baseScenePackage,
      chapter_assets: [
        ...baseScenePackage.chapter_assets,
        sceneAsset("chapter_asset_spoon", "Spoon", "spoon.png"),
      ],
    };
    const saveSpy = vi.fn();

    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackage}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(
      within(screen.getByRole("article", { name: "Add Spoon to Assembly" }))
        .getByRole("button", { name: "Add to Assembly" }),
    );

    await waitFor(() => expect(layerLabels(layerTree)).toEqual(["Spoon", "Breakfast props", "Breakfast bowl", "Cleanup cloth"]));
    expect(Array.from(layerTree.querySelectorAll<HTMLElement>("[data-depth]")).map((row) => row.dataset.depth)).toEqual(["0", "0", "1", "1"]);
    expect(canvasOverlayOrder()).toEqual(["placement_cloth", "placement_bowl", "placement_chapter_asset_spoon"]);
    expect(within(layerTree).getByLabelText("Drop at root before Spoon")).toHaveAttribute("data-layer-drop-kind", "root");
    expect(within(layerTree).getByLabelText("Drop at root before Breakfast props")).toHaveAttribute("data-layer-drop-kind", "root");
    expect(within(layerTree).getByLabelText("Drop into Breakfast props at position 2")).toHaveAttribute("data-layer-drop-kind", "group-child");

    await act(async () => {
      dragLayerToDropZone(layerTree, /Spoon target/, "Drop into Breakfast props at position 2");
    });

    expect(layerLabels(layerTree)).toEqual(["Breakfast props", "Breakfast bowl", "Spoon", "Cleanup cloth"]);
    expect(Array.from(layerTree.querySelectorAll<HTMLElement>("[data-depth]")).map((row) => row.dataset.depth)).toEqual(["0", "1", "1", "1"]);
    expect(canvasOverlayOrder()).toEqual(["placement_cloth", "placement_chapter_asset_spoon", "placement_bowl"]);
    expect(within(layerTree).getByRole("button", { name: /Spoon target/, pressed: true })).toBeInTheDocument();

    await user.click(expectIconOnlySaveButton());

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const savedManifest = saveSpy.mock.calls.at(-1)?.[0] as ChapterSceneAssemblyManifest;
    expect(savedManifest.groups).toEqual([
      expect.objectContaining({
        id: "group_1",
        placement_ids: ["placement_bowl", "placement_chapter_asset_spoon", "placement_cloth"],
      }),
    ]);
    expect(savedManifest.placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "placement_chapter_asset_spoon", group_id: "group_1" }),
    ]));
    expect(savedManifest.layer_order).toEqual(["placement_bowl", "placement_chapter_asset_spoon", "placement_cloth"]);
  });

  it("keeps multi-selection active in the draggable placement layer tree", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    const bowlRow = within(layerTree).getByRole("button", { name: /Breakfast bowl target/ });
    const clothRow = within(layerTree).getByRole("button", { name: /Cleanup cloth target/ });
    await user.click(bowlRow);
    await user.keyboard("{Control>}");
    await user.click(clothRow);
    await user.keyboard("{/Control}");

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("tree", { name: "Placement layer order" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("2 placements selected");
    expect(layerTree.querySelector(".assembly-layer-panel-delete-button")).not.toBeInTheDocument();
  });

  it("groups selected placement rows and ungroups without deleting child placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    await user.keyboard("{Control>}");
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    await user.keyboard("{/Control}");

    await user.click(within(layerTree).getByRole("button", { name: "Group selected layers" }));

    expect(within(layerTree).getByRole("button", { name: /Group 1 Group/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(["Group 1", "Breakfast bowl", "Cleanup cloth"]);
    const groupRow = within(layerTree).getByRole("button", { name: /Group 1 Group/ }).closest(".assembly-layer-row") as HTMLElement;
    expect(groupRow.querySelector(".assembly-layer-collapse-button")).toBeInTheDocument();
    expect(groupRow.querySelector(".assembly-layer-thumb-group")).toBeInTheDocument();
    expect(groupRow.querySelector(".assembly-layer-name")).toHaveTextContent("Group 1");
    expect(groupRow.querySelector(".assembly-layer-role")).toHaveTextContent("(2)");
    expect(within(groupRow).getByRole("button", { name: "Hide Group 1 group" })).toHaveClass("assembly-layer-visibility-button");
    expect(Array.from(layerTree.querySelectorAll<HTMLElement>("[data-depth]")).map((row) => row.dataset.depth)).toEqual(["0", "1", "1"]);
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("1 selected");
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(properties).toHaveTextContent("Group 1");
    expect(properties).toHaveTextContent("2 placements grouped.");
    expect(screen.getByTestId("overlay-selection-group_1")).toBeInTheDocument();
    expect(screen.getByTestId("overlay-selection-label-group_1")).toHaveTextContent("Group 1");
    expect(screen.queryByTestId("overlay-label-placement_bowl")).not.toBeInTheDocument();
    expect(screen.queryByTestId("overlay-label-placement_cloth")).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: "Ungroup selected layer" })).not.toBeInTheDocument();
    expect(within(groupRow).getByRole("button", { name: "Ungroup Group 1" })).toHaveClass("assembly-layer-ungroup-button");

    await user.click(within(groupRow).getByRole("button", { name: "Ungroup Group 1" }));

    expect(within(layerTree).queryByRole("button", { name: /Group 1 Group/ })).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);
  });

  it("moves a grouped placement back to root through the draggable layer tree", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const baseScenePackage = scenePackageWithGroupedPlacements();
    const scenePackage: ChapterScenePackage = {
      ...baseScenePackage,
      chapter_assets: [
        ...baseScenePackage.chapter_assets,
        sceneAsset("chapter_asset_spoon", "Spoon", "spoon.png"),
      ],
    };
    const saveSpy = vi.fn();

    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackage}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(
      within(screen.getByRole("article", { name: "Add Spoon to Assembly" }))
        .getByRole("button", { name: "Add to Assembly" }),
    );

    await act(async () => {
      dragLayerToDropZone(layerTree, /Spoon target/, "Drop into Breakfast props at position 2");
    });
    expect(Array.from(layerTree.querySelectorAll<HTMLElement>("[data-depth]")).map((row) => row.dataset.depth)).toEqual(["0", "1", "1", "1"]);

    await act(async () => {
      dragLayerToDropZone(layerTree, /Spoon target/, "Drop at root end");
    });

    expect(layerLabels(layerTree)).toEqual(["Breakfast props", "Breakfast bowl", "Cleanup cloth", "Spoon"]);
    expect(Array.from(layerTree.querySelectorAll<HTMLElement>("[data-depth]")).map((row) => row.dataset.depth)).toEqual(["0", "1", "1", "0"]);
    expect(canvasOverlayOrder()).toEqual(["placement_chapter_asset_spoon", "placement_cloth", "placement_bowl"]);

    await user.click(expectIconOnlySaveButton());

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const savedManifest = saveSpy.mock.calls.at(-1)?.[0] as ChapterSceneAssemblyManifest;
    expect(savedManifest.groups).toEqual([
      expect.objectContaining({
        id: "group_1",
        placement_ids: ["placement_bowl", "placement_cloth"],
      }),
    ]);
    expect(savedManifest.placements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "placement_chapter_asset_spoon", group_id: null }),
    ]));
    expect(savedManifest.layer_order).toEqual(["placement_bowl", "placement_cloth", "placement_chapter_asset_spoon"]);
  });

  it("confirms group deletion and removes the group with its child placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithGroupedPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast props Group/ }));

    await user.click(within(layerTree).getByRole("button", { name: "Delete Breakfast props group" }));

    expect(screen.getByRole("alertdialog", { name: "Delete Breakfast props?" })).toHaveTextContent(
      "This deletes the group and its 2 child placements.",
    );

    await user.click(screen.getByRole("button", { name: "Confirm delete group" }));

    expect(within(layerTree).queryByRole("button", { name: /Breakfast props Group/ })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl target/ })).not.toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: /Cleanup cloth target/ })).not.toBeInTheDocument();
    expect(screen.getByText("0 placements")).toBeInTheDocument();
  });

  it("confirms placement deletion from the layer tree", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));

    await user.click(within(layerTree).getByRole("button", { name: "Delete Cleanup cloth placement" }));

    expect(screen.getByRole("alertdialog", { name: "Delete Cleanup cloth?" })).toHaveTextContent(
      "This removes the placement from layer order, groups, and dependency lists.",
    );

    await user.click(screen.getByRole("button", { name: "Confirm delete placement" }));

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(within(layerTree).queryByRole("button", { name: /Cleanup cloth target/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 placement")).toBeInTheDocument();
  });

  it("keeps group collapse as local layer tree UI state", async () => {
    mockScenePackageImages();
    vi.useFakeTimers();
    const onSaveAssemblyManifest = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithGroupedPlacements()}
        onSaveAssemblyManifest={onSaveAssemblyManifest}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });

    fireEvent.click(within(layerTree).getByRole("button", { name: "Collapse Breakfast props group" }));
    await advanceAutosaveTime(ASSEMBLY_AUTOSAVE_DEBOUNCE_MS);

    expect(onSaveAssemblyManifest).not.toHaveBeenCalled();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
  });

  it("keeps selected group layer after save echo selection pruning", () => {
    const draft = createAssemblyDraft(scenePackageWithGroupedPlacements());

    expect(
      preserveAssemblySelection(draft, {
        selectedPlacementId: null,
        selectedLayerNodeIds: ["group_1"],
      }),
    ).toEqual({
      selectedPlacementId: null,
      selectedLayerNodeIds: ["group_1"],
    });
  });

  it("toggles placement visibility from the layer tree without saving editor-only state", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    expect(screen.getByTestId("overlay-region-placement_bowl")).toBeInTheDocument();

    await user.click(within(layerTree).getByRole("button", { name: "Hide Breakfast bowl" }));

    expect(screen.queryByTestId("overlay-region-placement_bowl")).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: "Show Breakfast bowl" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(saveSpy).not.toHaveBeenCalled();

    await user.click(within(layerTree).getByRole("button", { name: "Show Breakfast bowl" }));

    expect(screen.getByTestId("overlay-region-placement_bowl")).toBeInTheDocument();
  });
});

function canvasOverlayOrder() {
  const overlayLayer = screen.getByTestId("overlay-region-placement_bowl").parentElement;
  return Array.from(overlayLayer?.querySelectorAll<HTMLElement>("[data-testid^='overlay-region-']") ?? [])
    .map((element) => element.dataset.testid?.replace("overlay-region-", "") ?? "");
}

function expectLayerRowOrder(row: HTMLElement) {
  const thumbnail = row.querySelector(".assembly-layer-thumb");
  const name = row.querySelector(".assembly-layer-name");
  const role = row.querySelector(".assembly-layer-role");
  const actions = row.querySelector(".assembly-layer-row-actions");

  expect(thumbnail).toBeInTheDocument();
  expect(name).toBeInTheDocument();
  expect(role).toBeInTheDocument();
  expect(actions).toBeInTheDocument();
  expect(isBefore(thumbnail, name)).toBe(true);
  expect(isBefore(name, role)).toBe(true);
  expect(actions?.contains(role)).toBe(true);
}

function dragLayerToDropZone(
  layerTree: HTMLElement,
  rowName: RegExp,
  dropLabel: string,
) {
  const rowSelect = within(layerTree)
    .getAllByRole("button", { name: rowName })
    .find((element) => element.classList.contains("assembly-layer-row-select"));
  const row = rowSelect?.closest(".assembly-layer-row");
  const dropZone = within(layerTree).getByLabelText(dropLabel);

  expect(row).toBeInTheDocument();
  layerTree.querySelectorAll(".assembly-layer-drop-zone").forEach((zone) => {
    mockRect(zone, { left: 0, top: 0, width: 0, height: 0 });
  });
  mockRect(rowSelect as HTMLElement, { left: 24, top: 24, width: 220, height: 30 });
  mockRect(dropZone, { left: 24, top: 86, width: 280, height: 12 });
  fireEvent.pointerDown(rowSelect as HTMLElement, {
    button: 0,
    buttons: 1,
    clientX: 34,
    clientY: 34,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    buttons: 1,
    clientX: 44,
    clientY: 44,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    buttons: 1,
    clientX: 70,
    clientY: 92,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerUp(document, {
    button: 0,
    clientX: 70,
    clientY: 92,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
}

function isBefore(left: Element | null, right: Element | null) {
  if (!left || !right) {
    return false;
  }
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
}
