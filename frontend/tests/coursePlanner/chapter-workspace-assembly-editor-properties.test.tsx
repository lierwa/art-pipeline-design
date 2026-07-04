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


describe("Chapter Scene Studio assembly properties and asset actions", () => {
  it("batch-updates runtime role for multi-selected placements from the properties panel", async () => {
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
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));
    await user.keyboard("{Control>}");
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    await user.keyboard("{/Control}");

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getAllByText("2 placements selected")).toHaveLength(2);

    await user.click(within(properties).getByRole("button", { name: "Initial" }));

    expect(within(layerTree).getByRole("button", { name: /Breakfast bowl initial/ })).toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth initial/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({ id: "placement_bowl", runtime_role: "initial" }),
          expect.objectContaining({ id: "placement_cloth", runtime_role: "initial" }),
        ]),
      }));
    });
  });

  it("disables self and cycle-causing dependency options in the placement properties panel", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    const clothDependency = within(properties).getByRole("checkbox", { name: /placement_cloth/i });
    await user.click(clothDependency);
    expect(clothDependency).toBeChecked();

    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));

    const selfDependency = within(properties).getByRole("checkbox", { name: /placement_cloth/i });
    const cycleDependency = within(properties).getByRole("checkbox", { name: /placement_bowl/i });
    expect(selfDependency).toBeDisabled();
    expect(cycleDependency).toBeDisabled();
  });

  it("confirms placement removal and clears dependency references from remaining placements", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithDependentPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await user.click(within(properties).getByRole("button", { name: "Remove placement" }));

    expect(await screen.findByText("Remove Breakfast bowl?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl/ })).not.toBeInTheDocument();
    expect(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        placements: [expect.objectContaining({
          id: "placement_cloth",
          requires_placed: [],
        })],
      }));
    });
  });

  it("keeps the manifest unchanged when placement removal is canceled", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithDependentPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    await user.click(within(properties).getByRole("button", { name: "Remove placement" }));
    expect(await screen.findByText("Remove Breakfast bowl?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove Breakfast bowl?")).not.toBeInTheDocument();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeDisabled();
  });

  it("keeps preserved placements in alignment review after Empty Scene replacement until the author explicitly saves", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const emptyScenePanel = screen.getByRole("region", { name: "Empty scene images" });
    const selectButtons = within(emptyScenePanel).getAllByRole("button", { name: "Select as Empty Scene" });
    fireEvent.click(selectButtons[1]);
    expect(screen.getByRole("button", { name: "Replace Empty Scene" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Replace Empty Scene" }));
    await flushAsyncScenePackage();

    expect(screen.getByText("2 placements need alignment review.")).toBeInTheDocument();
    expect(screen.getAllByText("Alignment risk").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeEnabled();

    await advanceAutosaveCycle();
    expect(saveSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save Assembly" }));
    await flushAsyncScenePackage();

    expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      empty_scene_image_id: "empty_scene_002",
      empty_scene_size: { width: 1536, height: 1024 },
    }));
    expect(screen.queryByText("2 placements need alignment review.")).not.toBeInTheDocument();
  });

  it("keeps autosave blocked when only one preserved placement is re-positioned after Empty Scene replacement", async () => {
    vi.useFakeTimers();
    mockScenePackageImages();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const emptyScenePanel = screen.getByRole("region", { name: "Empty scene images" });
    const selectButtons = within(emptyScenePanel).getAllByRole("button", { name: "Select as Empty Scene" });
    fireEvent.click(selectButtons[1]);
    fireEvent.click(screen.getByRole("button", { name: "Replace Empty Scene" }));
    await flushAsyncScenePackage();

    expect(screen.getByText("2 placements need alignment review.")).toBeInTheDocument();

    const properties = screen.getByRole("region", { name: "Placement properties" });
    fireEvent.change(within(properties).getByLabelText("cx"), { target: { value: "0.5" } });

    expect(screen.getByText("1 placements need alignment review.")).toBeInTheDocument();

    await advanceAutosaveCycle();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(screen.getByText("1 placements need alignment review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Assembly" })).toBeEnabled();
  });

  it("requires explicit confirmation before clearing placements after Empty Scene replacement", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithReplacementCandidate()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const emptyScenePanel = screen.getByRole("region", { name: "Empty scene images" });
    const selectButtons = within(emptyScenePanel).getAllByRole("button", { name: "Select as Empty Scene" });
    await user.click(selectButtons[1]);
    await user.click(await screen.findByRole("button", { name: "Replace Empty Scene" }));

    await user.click(screen.getByRole("button", { name: "Clear placements" }));
    expect(await screen.findByText("Clear placements for the new Empty Scene?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm clear" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        empty_scene_image_id: "empty_scene_002",
        empty_scene_size: { width: 1536, height: 1024 },
        placements: [],
        groups: [],
        layer_order: [],
      }));
    });
  });

  it("confirms used Chapter Asset deletion and removes placement plus dependency references", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithDependentPlacements()} />);

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    const assetRows = within(assetPool).getAllByRole("article");
    await user.click(within(assetRows[0] ?? document.body).getByRole("button", { name: "Delete Asset" }));
    expect(await screen.findByText("Delete Breakfast bowl?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete asset" }));

    expect(within(assetPool).queryByText("Breakfast bowl")).not.toBeInTheDocument();
    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    expect(within(layerTree).queryByRole("button", { name: /Breakfast bowl/ })).not.toBeInTheDocument();
    await user.click(within(layerTree).getByRole("button", { name: /Cleanup cloth target/ }));
    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).queryByRole("checkbox", { name: /placement_bowl/i })).not.toBeInTheDocument();
  });

  it("confirms Complete Scene deletion without touching Chapter Assets or the locked Final snapshot", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        initialScenePackage={{
          ...scenePackageWithTwoPlacements(),
          final_scene: buildLockedFinalScene(scenePackageWithTwoPlacements()),
        }}
      />,
    );

    const completeImagesPanel = screen.getByRole("region", { name: "Complete scene images" });
    await user.click(within(completeImagesPanel).getByRole("button", { name: "Delete Image" }));
    expect(await screen.findByText("Delete complete-scene.png?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm delete image" }));

    expect(within(completeImagesPanel).queryByText("complete-scene.png")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assembly asset pool" })).toHaveTextContent("Breakfast bowl");
    expect(screen.getByRole("region", { name: "Final scene" })).toHaveTextContent("Locked");
  });

  it("keeps placement metadata read-only and does not surface out-of-scope custom gameplay fields", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    render(<AssemblyEditorHarness initialScenePackage={scenePackageWithTwoPlacements()} />);

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast bowl target/ }));

    const properties = screen.getByRole("region", { name: "Placement properties" });
    expect(within(properties).getByText("chapter_asset_bowl")).toBeInTheDocument();
    expect(within(properties).queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(within(properties).queryByLabelText(/asset id/i)).not.toBeInTheDocument();
    expect(properties).not.toHaveTextContent("Blocked toast");
    expect(properties).not.toHaveTextContent("Target area");
    expect(properties).not.toHaveTextContent("Tolerance");
    expect(properties).not.toHaveTextContent("Gameplay step");
  });

  it("ungroups a first-level group and keeps placements in layer_order", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithGroupedPlacements()}
        onSaveAssemblyManifest={saveSpy}
      />,
    );

    const layerTree = screen.getByRole("region", { name: "Assembly layers" });
    await user.click(within(layerTree).getByRole("button", { name: "Breakfast props" }));
    await user.click(within(layerTree).getByRole("button", { name: "Ungroup selected layer" }));

    expect(within(layerTree).queryByRole("button", { name: "Breakfast props" })).not.toBeInTheDocument();
    expect(layerLabels(layerTree)).toEqual(["Breakfast bowl", "Cleanup cloth"]);

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenLastCalledWith(expect.objectContaining({
        groups: [],
        layer_order: ["placement_bowl", "placement_cloth"],
      }));
    });
  });

  it("uploads a direct scene asset into the same connected pool", async () => {
    mockScenePackageImages();
    const user = userEvent.setup();
    const uploadInputSpy = vi.fn();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture()}
        onDirectAssetUploadInput={uploadInputSpy}
      />,
    );

    const input = screen.getByLabelText("Upload Scene Asset", { selector: 'input[type="file"]' });
    await user.selectOptions(screen.getByLabelText("Upload target object"), "target_object_cloth");

    await user.upload(input, new File(["asset"], "cloth.png", { type: "image/png" }));

    expect(uploadInputSpy).toHaveBeenCalledWith({
      displayName: "cloth",
      linkedTargetObjectId: "target_object_cloth",
    });
    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(await within(assetPool).findByRole("heading", { name: "cloth" })).toBeInTheDocument();
    expect(within(assetPool).getAllByText("cloth").length).toBeGreaterThanOrEqual(2);
    expect(within(assetPool).getByRole("button", { name: "Upload Scene Asset" })).toBeInTheDocument();
  });
});
