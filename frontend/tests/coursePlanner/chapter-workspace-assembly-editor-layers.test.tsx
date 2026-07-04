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
import { exportAssemblyPreviewFile } from "../../src/features/coursePlanner/assembly/assemblyExport";
import { buildTldrawAssemblySnapshot } from "../../src/features/coursePlanner/assembly/tldrawAssemblyAdapter";
import {
  applySnapshotToEditor,
  createAssemblyCameraFitState,
  readPlacementSelectionState,
  syncSelectionToEditor,
  type AssemblyEditorShapeLike,
} from "../../src/features/coursePlanner/components/AssemblyEditorCanvas";
import { ChapterSceneStudio } from "../../src/features/coursePlanner/components/ChapterSceneStudio";
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
  studioChapterFixture,
  studioScenePackageFixture,
  studioScenePackFixture,
} from "./chapterWorkspaceFixtures";

import {
  ASSEMBLY_AUTOSAVE_DEBOUNCE_MS,
  AssemblyEditorHarness,
  type AssemblyEditorHarnessControls,
  advanceAutosaveCycle,
  advanceAutosaveTime,
  buildLockedFinalScene,
  buildSnapshot,
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
import { createMockAssemblyEditor, layerLabels } from "./assemblyEditorTestUtils";

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


describe("Chapter Scene Studio assembly layers", () => {
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

    expect(screen.getByText("Saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to Assembly" }));

    expect(await screen.findByText("Saving")).toBeInTheDocument();
    expect(screen.getByText("Used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Locate Placement" })).toBeInTheDocument();
    expect(screen.getByText("1 placements")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Milk cup target/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Placement properties" })).toHaveTextContent("Milk cup");

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeDisabled();
  });

  it("locates the used asset placement and syncs selection across layer tree and property panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    await user.click(screen.getByRole("button", { name: "Locate Placement" }));

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl/, pressed: true })).toBeInTheDocument();
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByText("chapter_asset_bowl")).toBeInTheDocument();
    expect(within(properties).getByRole("button", { name: "Target" })).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getByRole("button", { name: "Add to Assembly" })).toBeEnabled();
  });

  it("reorders layers through the tree and saves the updated front-to-back layer_order", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);

    await user.click(within(layerTree).getByRole("button", { name: "Move Cleanup cloth to top" }));

    expect(layerLabels(layerTree)).toEqual(["Cleanup cloth", "Breakfast bowl"]);

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        layer_order: ["placement_cloth", "placement_bowl"],
      }));
    });
  });

  it("groups multi-selected placements, keeps child ids stable, and hides runtime role indicators on group rows", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    const bowlRow = within(layerTree).getByRole("button", { name: /Breakfast bowl target/ });
    const clothRow = within(layerTree).getByRole("button", { name: /Cleanup cloth target/ });
    await user.click(bowlRow);
    await user.keyboard("{Control>}");
    await user.click(clothRow);
    await user.keyboard("{/Control}");
    await user.click(within(layerTree).getByRole("button", { name: "Group selected layers" }));

    const groupRow = within(layerTree).getByRole("button", { name: "Group 1" });
    expect(groupRow).toBeInTheDocument();
    expect(groupRow).not.toHaveTextContent("target");
    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        groups: [{
          id: "group_1",
          display_name: "Group 1",
          placement_ids: ["placement_bowl", "placement_cloth"],
        }],
      }));
    });
  });
});
