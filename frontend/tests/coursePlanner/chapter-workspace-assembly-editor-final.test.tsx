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


describe("Chapter Scene Studio assembly final export", () => {
  it("flushes the current dirty manifest before Lock Final so stale assembly is not published silently", async () => {
    mockScenePackageImages();
    mockCanvasBlob();
    const savedCxValues: number[] = [];
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        saveAssemblyBehavior={async (manifest, current) => {
          savedCxValues.push(
            manifest.placements.find((placement) => placement.id === "placement_bowl")?.transform.cx ?? -1,
          );
          return {
            ...current,
            assembly: {
              ...manifest,
              updated_at: "2026-07-04T08:12:00Z",
            },
          };
        }}
      />,
    );

    fireEvent.click(within(screen.getByRole("region", { name: "Assembly layers" })).getByRole("button", { name: /Breakfast bowl target/ }));
    fireEvent.change(
      within(screen.getByRole("region", { name: "Placement properties" })).getByRole("spinbutton", { name: "cx" }),
      { target: { value: "0.303" } },
    );

    expect(screen.getByText("Saving")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lock Final" }));

    await waitFor(() => expect(savedCxValues).toEqual([0.303]));
  });

  it("exports the selected Empty Scene first and paints placements back-to-front from layer_order", async () => {
    mockScenePackageImages();
    mockCanvasBlob();
    const drawOrder: string[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage(image: CanvasImageSource) {
        drawOrder.push((image as HTMLImageElement).src);
      },
      save() {},
      restore() {},
      translate() {},
      rotate() {},
    } as CanvasRenderingContext2D));

    const scenePackage = scenePackageWithTwoPlacements();
    await exportAssemblyPreviewFile(scenePackage, scenePackage.assembly);

    expect(drawOrder).toEqual([
      "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/empty_scene_images/empty_scene_001",
      "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/chapter_assets/chapter_asset_cloth",
      "/api/course-planner/chapters/chapter_breakfast_kitchen/scene-package/media/chapter_assets/chapter_asset_bowl",
    ]);
  });

  it("keeps the locked final scene while new assembly edits become dirty again", async () => {
    const lockedScenePackage = scenePackageWithTwoPlacements();
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={{
          ...lockedScenePackage,
          final_scene: buildLockedFinalScene(lockedScenePackage),
        }}
      />,
    );

    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("chapter-scene-final.png")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("region", { name: "Assembly layers" })).getByRole("button", { name: /Breakfast bowl target/ }));
    fireEvent.change(
      within(screen.getByRole("region", { name: "Placement properties" })).getByRole("spinbutton", { name: "cx" }),
      { target: { value: "0.611" } },
    );

    expect(screen.getByText("Saving")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.getByText("chapter-scene-final.png")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Final scene" })).toHaveTextContent("Locked");
  });
});
