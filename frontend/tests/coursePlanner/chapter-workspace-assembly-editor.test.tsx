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


describe("Chapter Scene Studio assembly editor wiring", () => {
  it("renders the tldraw-backed editor controls when an Empty Scene Image is selected", async () => {
    mockScenePackageImages();
    render(<AssemblyEditorHarness initialScenePackage={studioScenePackageFixture()} />);

    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
    expect(screen.getByTestId("mock-tldraw-root")).toBeInTheDocument();
  });

  it("disables Add to Assembly when no Empty Scene Image is selected", async () => {
    const user = userEvent.setup();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          current_empty_scene_image_id: null,
          assembly: {
            ...emptyAssemblyManifest(),
            empty_scene_image_id: null,
            empty_scene_size: null,
          },
        })}
      />,
    );

    const assetPool = screen.getByRole("region", { name: "Assembly asset pool" });
    expect(within(assetPool).getByText("Select an Empty Scene Image to enable Add to Assembly.")).toBeInTheDocument();
    const addButton = within(assetPool).getByRole("button", { name: "Add to Assembly" });
    expect(addButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Save Assembly" }));
    expect(screen.getByText("Select an Empty Scene Image to start the Assembly editor.")).toBeInTheDocument();
  });

  it("shows target coverage from placed assets and keeps historical notes non-blocking", async () => {
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={studioScenePackageFixture({
          target_object_exemptions: [
            {
              target_object_id: "target_object_cloth",
              reason: "Legacy note from an earlier review.",
            },
          ],
        })}
      />,
    );

    const coveragePanel = screen.getByRole("region", { name: "Assembly target coverage" });
    expect(within(coveragePanel).getByText("Breakfast bowl")).toBeInTheDocument();
    expect(within(coveragePanel).getByText("Covered")).toBeInTheDocument();
    expect(within(coveragePanel).getByText("cloth")).toBeInTheDocument();
    expect(within(coveragePanel).getByText("Missing")).toBeInTheDocument();
    expect(within(coveragePanel).getByText("Note: Legacy note from an earlier review.")).toBeInTheDocument();
    expect(screen.getByText("Missing target objects: cloth.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Final" })).toBeDisabled();
    expect(within(coveragePanel).queryByText("Exempted")).not.toBeInTheDocument();
    expect(within(coveragePanel).queryByRole("button", { name: /exemption/i })).not.toBeInTheDocument();
  });

  it("surfaces a save-first Lock Final action when the selected Empty Scene changes after the assembly was last saved", async () => {
    mockScenePackageImages();
    render(
      <AssemblyEditorHarness
        initialScenePackage={{
          ...scenePackageWithTwoPlacements(),
          current_empty_scene_image_id: "empty_scene_002",
          empty_scene_images: [
            scenePackageWithTwoPlacements().empty_scene_images[0],
            {
              ...scenePackageWithTwoPlacements().empty_scene_images[0],
              id: "empty_scene_002",
              original_filename: "empty-scene-2.png",
            },
          ],
          assembly: {
            ...scenePackageWithTwoPlacements().assembly,
            empty_scene_image_id: "empty_scene_001",
          },
        }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Lock Final" })).toBeEnabled());
  });

  it("projects mismatch readiness from the manifest argument instead of hard-coding scenePackage.assembly", () => {
    const scenePackage = {
      ...scenePackageWithTwoPlacements(),
      current_empty_scene_image_id: "empty_scene_002",
      empty_scene_images: [
        scenePackageWithTwoPlacements().empty_scene_images[0],
        {
          ...scenePackageWithTwoPlacements().empty_scene_images[0],
          id: "empty_scene_002",
          original_filename: "empty-scene-2.png",
        },
      ],
      assembly: {
        ...scenePackageWithTwoPlacements().assembly,
        empty_scene_image_id: "empty_scene_001",
      },
    };

    const matchingDraftManifest = {
      ...scenePackage.assembly,
      empty_scene_image_id: "empty_scene_002",
      empty_scene_size: { width: 1024, height: 1024 },
    };

    expect(buildAssemblyReadiness(scenePackage).is_ready).toBe(false);
    expect(
      buildAssemblyReadiness(scenePackage, matchingDraftManifest).reasons,
    ).not.toContain(
      "Saved Assembly still points to a different Empty Scene Image. Re-save after reviewing the current selection.",
    );
  });

  it("does not report Assembly ready in the page header when saved assembly is stale", () => {
    const scenePackage = {
      ...scenePackageWithTwoPlacements(),
      current_empty_scene_image_id: "empty_scene_002",
      empty_scene_images: [
        scenePackageWithTwoPlacements().empty_scene_images[0],
        {
          ...scenePackageWithTwoPlacements().empty_scene_images[0],
          id: "empty_scene_002",
          original_filename: "empty-scene-2.png",
        },
      ],
      assembly: {
        ...scenePackageWithTwoPlacements().assembly,
        empty_scene_image_id: "empty_scene_001",
      },
    };

    expect(isAssemblyReady(scenePackage)).toBe(false);
    expect(studioStatusLabel("ready", scenePackage)).toBe("Images ready");
  });
});
