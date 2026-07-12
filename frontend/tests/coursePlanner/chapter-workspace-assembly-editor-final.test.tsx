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

const ASSEMBLY_TEST_SCENE_SIZE_PX = 1024;

function placementGeometryInput(name: string) {
  return within(screen.getByRole("region", { name: "Placement properties" })).getByRole("spinbutton", { name });
}

function normalizedPlacementPx(pixelValue: number) {
  return pixelValue / ASSEMBLY_TEST_SCENE_SIZE_PX;
}

function assemblyEditorStatus() {
  return screen.getByLabelText("Assembly editor status");
}

function scenePackageWithManifestFacts(input?: {
  assembly?: Partial<ChapterSceneAssemblyManifest>;
  targetObjects?: ChapterScenePackage["target_objects"];
}): ChapterScenePackage {
  const base = scenePackageWithTwoPlacements();
  return {
    ...base,
    target_objects: input?.targetObjects ?? base.target_objects,
    assembly: {
      ...base.assembly,
      ...(input?.assembly ?? {}),
    },
  };
}

describe("Assembly editor final export helpers", () => {
  it("flushes the current dirty manifest through the editor lock-final hook", async () => {
    mockScenePackageImages();
    mockCanvasBlob();
    const savedCxValues: number[] = [];
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithTwoPlacements()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
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

    fireEvent.click(within(screen.getByRole("region", { name: "Placement layers" })).getByRole("button", { name: /Breakfast bowl target/ }));
    fireEvent.change(
      placementGeometryInput("Position X"),
      { target: { value: "310" } },
    );

    expect(within(assemblyEditorStatus()).getByText("Saving changes")).toBeInTheDocument();
    await act(async () => {
      await controlsRef.current?.lockFinal();
    });

    await waitFor(() => expect(savedCxValues).toEqual([normalizedPlacementPx(310)]));
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

  it("preserves the locked final snapshot while new assembly edits become dirty again", async () => {
    const lockedScenePackage = scenePackageWithTwoPlacements();
    mockScenePackageImages();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={{
          ...lockedScenePackage,
          final_scene: buildLockedFinalScene(lockedScenePackage),
        }}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
      />,
    );

    expect(controlsRef.current?.getScenePackage().final_scene?.original_filename).toBe("chapter-scene-final.png");

    fireEvent.click(within(screen.getByRole("region", { name: "Placement layers" })).getByRole("button", { name: /Breakfast bowl target/ }));
    fireEvent.change(
      placementGeometryInput("Position X"),
      { target: { value: "626" } },
    );

    expect(within(assemblyEditorStatus()).getByText("Saving changes")).toBeInTheDocument();
    await waitFor(() => expect(within(assemblyEditorStatus()).getByText("All changes saved")).toBeInTheDocument());
    expect(controlsRef.current?.getScenePackage().final_scene?.original_filename).toBe("chapter-scene-final.png");
  });

  it("treats readiness as manifest/domain facts and does not require a saved timestamp", () => {
    const scenePackage = scenePackageWithManifestFacts({
      assembly: { updated_at: null },
    });

    const readiness = buildAssemblyReadiness(scenePackage);

    expect(readiness.is_ready).toBe(true);
    expect(isAssemblyReady(scenePackage)).toBe(true);
  });

  it("blocks readiness when manifest references do not resolve to domain facts", () => {
    const missingEmptyScene = scenePackageWithManifestFacts({
      assembly: { empty_scene_image_id: "empty_scene_missing" },
    });
    const brokenDependency = scenePackageWithManifestFacts({
      assembly: {
        placements: scenePackageWithTwoPlacements().assembly.placements.map((placement) => (
          placement.id === "placement_bowl"
            ? { ...placement, requires_placed: ["placement_missing"] }
            : placement
        )),
      },
    });

    expect(buildAssemblyReadiness(missingEmptyScene).reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("Empty Scene Image")]),
    );
    expect(buildAssemblyReadiness(brokenDependency).reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("dependency")]),
    );
  });

  it("blocks readiness when placed manifest uses a different Empty Scene than the current selection", () => {
    const scenePackage = scenePackageWithTwoPlacements();
    const secondEmptyScene = {
      ...scenePackage.empty_scene_images[0],
      id: "empty_scene_002",
      original_filename: "empty-scene-current.png",
      storage_path: "scene_package/empty_scene_002.png",
      width: 1024,
      height: 1024,
    };
    const mismatchedScenePackage = {
      ...scenePackage,
      current_empty_scene_image_id: secondEmptyScene.id,
      empty_scene_images: [
        scenePackage.empty_scene_images[0],
        secondEmptyScene,
      ],
    };

    const readiness = buildAssemblyReadiness(mismatchedScenePackage);

    expect(readiness.is_ready).toBe(false);
    expect(readiness.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("different Empty Scene Image")]),
    );
  });

  it("requires core and required target coverage but does not block on recommended targets", () => {
    const scenePackage = scenePackageWithManifestFacts({
      targetObjects: [
        { id: "target_object_bowl", label: "Breakfast bowl", priority: "required", description: null },
        { id: "target_object_cloth", label: "Cleanup cloth", priority: "core", description: null },
        { id: "target_object_wall_clock", label: "Wall clock", priority: "recommended", description: null },
      ],
    });

    const readiness = buildAssemblyReadiness(scenePackage);

    expect(readiness.is_ready).toBe(true);
    expect(readiness.reasons).toEqual([]);
    expect(readiness.target_coverage.find((item) => item.target.id === "target_object_wall_clock")?.status).toBe("missing");
  });

  it("keeps final lock available when only transient assembly UI state changes", async () => {
    mockScenePackageImages();
    mockCanvasBlob();
    const user = userEvent.setup();
    const controlsRef = { current: null as AssemblyEditorHarnessControls | null };
    render(
      <AssemblyEditorHarness
        initialScenePackage={scenePackageWithGroupedPlacements()}
        onHarnessReady={(controls) => {
          controlsRef.current = controls;
        }}
      />,
    );

    expect(controlsRef.current?.getLockFinalState()?.readiness.is_ready).toBe(true);

    const layerTree = screen.getByRole("region", { name: "Placement layers" });
    await user.click(within(layerTree).getByRole("button", { name: /Breakfast props Group/ }));
    await user.click(within(layerTree).getByRole("button", { name: "Collapse Breakfast props group" }));

    const canvasToolbar = screen.getByRole("toolbar", { name: "Canvas tools" });
    await user.click(within(canvasToolbar).getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Import generated assets" }));
    expect(await screen.findByRole("dialog", { name: "Generated Chapter Assets" })).toBeInTheDocument();

    expect(controlsRef.current?.getLockFinalState()?.readiness.is_ready).toBe(true);
  });
});
