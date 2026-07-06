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
    expect(screen.getByRole("button", { name: "Locate Placement" })).toBeInTheDocument();
    expect(screen.getByText("1 placement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milk cup target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Milk cup");

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => expect(screen.getByText("All changes saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeDisabled();
  });

  it("locates the used asset placement and syncs selection across placement list and property panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    await user.click(screen.getByRole("button", { name: "Locate Placement" }));

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
    expect(within(layerTree).queryByRole("toolbar", { name: "Layer actions" })).not.toBeInTheDocument();
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
    expect(layerTree.querySelector(".asset-tree-arborist")).toBeInTheDocument();
    const bowlRow = within(layerTree).getByRole("button", { name: /Breakfast bowl target/ });
    expect(bowlRow).toBeInTheDocument();
    expect(bowlRow.tagName).not.toBe("BUTTON");
    const bowlLayerRow = bowlRow.closest(".assembly-layer-row") as HTMLElement;
    expect(bowlLayerRow).toBeInTheDocument();
    expect(bowlLayerRow.querySelector(".assembly-layer-thumb")).toBeInTheDocument();
    expect(bowlLayerRow.querySelector(".assembly-layer-drag-affordance")).toBeInTheDocument();
    expect(within(layerTree).queryByLabelText("Visibility for Breakfast bowl")).not.toBeInTheDocument();
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

    const primaryRow = within(layerTree).getByRole("button", { name: /Chapter asset target/ }).closest(".assembly-layer-row") as HTMLElement;
    expect(primaryRow).toBeInTheDocument();
    expect(primaryRow.querySelector(".assembly-layer-thumb")).toBeInTheDocument();
  });

  it("duplicates the used asset into a second unused row without copying placement", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    await user.click(screen.getByRole("button", { name: "Duplicate Chapter Asset" }));

    const rows = within(screen.getByRole("region", { name: "Assembly asset pool" })).getAllByRole("article");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] ?? document.body).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(rows[1] ?? document.body).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Locate Placement" })).toBeInTheDocument();
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
      (globalThis as typeof globalThis & {
        __mockArboristMove?: (args: { dragIds: string[]; parentId: string | null; index: number }) => void;
      }).__mockArboristMove?.({
        dragIds: ["placement_cloth"],
        parentId: "__REACT_ARBORIST_INTERNAL_ROOT__",
        index: 0,
      });
    });

    expect(layerLabels(layerTree)).toEqual(["Cleanup cloth", "Breakfast bowl"]);
    expect(canvasOverlayOrder()).toEqual(["placement_bowl", "placement_cloth"]);
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("X 635");
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
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/, pressed: true })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly editor status")).toHaveTextContent("2 selected");
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("2 placements selected");
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

    await user.click(within(layerTree).getByRole("button", { name: "Ungroup selected layer" }));

    expect(within(layerTree).queryByRole("button", { name: /Group 1 Group/ })).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);
  });

  it("confirms group deletion and removes the group with its child placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithGroupedPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });

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
});

function canvasOverlayOrder() {
  const overlayLayer = screen.getByTestId("overlay-region-placement_bowl").parentElement;
  return Array.from(overlayLayer?.querySelectorAll<HTMLElement>("[data-testid^='overlay-region-']") ?? [])
    .map((element) => element.dataset.testid?.replace("overlay-region-", "") ?? "");
}
